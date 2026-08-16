import {
  CryptoEnvelopeService,
  generateX25519KeyPair,
  deriveSharedKey,
  bytesToBase64,
  E2eeAuthenticationError,
  type E2eeContext,
  type E2eeEnvelope,
  type E2eeKeyProvider,
  type ViewportScreen,
} from '@devchain/shared';
import { TunnelViewportCryptoService } from './tunnel-viewport-crypto.service';

// Test layer: module-unit. Real shared CryptoEnvelopeService / X25519 ECDH (jest shim) with
// the keypair + device-store faked. Proves the viewport seam seals the screen under the paired
// device's shared key, binding sessionId + seq into the AAD, and resolves plaintext/blocked
// when no usable device is paired.

const INSTANCE_ID = 'inst-vp-1';
const SESSION_ID = 'sess-1';

function makeRng(seed: number): (n: number) => Uint8Array {
  let s = seed >>> 0;
  return (n: number) => {
    const out = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      s ^= s << 13;
      s ^= s >>> 17;
      s ^= s << 5;
      out[i] = s & 0xff;
    }
    return out;
  };
}

const pc = generateX25519KeyPair(makeRng(0x1111));
const mobile = generateX25519KeyPair(makeRng(0x2222));
const sharedKey = deriveSharedKey(mobile.privateKey, pc.publicKey);

const SCREEN: ViewportScreen = {
  lines: ['$ whoami', 'root', 'secret-token=abc123'],
  cursor: { x: 0, y: 2 },
  cols: 80,
  rows: 24,
};

function mobileService(device = mobile, deviceSharedKey = sharedKey): CryptoEnvelopeService {
  const provider: E2eeKeyProvider = {
    resolveSealKey: () => ({ kid: device.kid, key: deviceSharedKey }),
    getKeyById: (kid) => (kid === pc.kid || kid === device.kid ? deviceSharedKey : undefined),
  };
  return new CryptoEnvelopeService(provider, makeRng(0x3333));
}

const openCtx = (sessionId: string, seq: number): E2eeContext => ({
  lane: 'viewport',
  direction: 'pc-to-mobile',
  instanceId: INSTANCE_ID,
  routeKey: sessionId,
  seq,
});

interface FakeDevice {
  kid: string;
  publicKeyB64: string;
  trust: 'unverified' | 'verified' | 'revoked';
  addedAt: string;
}
const pairedDevice: FakeDevice = {
  kid: mobile.kid,
  publicKeyB64: bytesToBase64(mobile.publicKey),
  trust: 'verified',
  addedAt: '2026-01-01T00:00:00.000Z',
};

function makeService(devices: FakeDevice[], opts?: { e2eeRequired?: boolean }) {
  const keypair = { getOrCreate: jest.fn().mockResolvedValue(pc) };
  const deviceStore = {
    get: jest.fn((kid: string) => devices.find((device) => device.kid === kid) ?? null),
  };
  const svc = new TunnelViewportCryptoService(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    keypair as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    deviceStore as any,
    opts?.e2eeRequired,
  );
  return { svc, keypair };
}

describe('TunnelViewportCryptoService', () => {
  it('seals a full screen — the phone opens it with matching sessionId + seq', async () => {
    const { svc } = makeService([pairedDevice]);
    const channel = await svc.resolveViewportChannel(INSTANCE_ID, mobile.kid);
    expect(channel.mode).toBe('encrypted');

    const env = (await channel.sealScreen!(SESSION_ID, 7, SCREEN)) as E2eeEnvelope;
    expect(env.kid).toBe(pc.kid);
    const opened = await mobileService().open(env, openCtx(SESSION_ID, 7));
    expect(opened).toEqual(SCREEN);
  });

  it('binds sessionId + seq into the AAD — a different seq or session fails closed', async () => {
    const { svc } = makeService([pairedDevice]);
    const channel = await svc.resolveViewportChannel(INSTANCE_ID, mobile.kid);
    const env = (await channel.sealScreen!(SESSION_ID, 7, SCREEN)) as E2eeEnvelope;

    await expect(mobileService().open(env, openCtx(SESSION_ID, 8))).rejects.toBeInstanceOf(
      E2eeAuthenticationError,
    );
    await expect(mobileService().open(env, openCtx('other-session', 7))).rejects.toBeInstanceOf(
      E2eeAuthenticationError,
    );
  });

  it('falls back to plaintext when no device is paired', async () => {
    const { svc } = makeService([]);
    const channel = await svc.resolveViewportChannel(INSTANCE_ID, null);
    expect(channel.mode).toBe('plaintext');
    expect(channel.sealScreen).toBeUndefined();
  });

  it('blocks when E2EE is required but no device is paired', async () => {
    const { svc } = makeService([], { e2eeRequired: true });
    const channel = await svc.resolveViewportChannel(INSTANCE_ID, null);
    expect(channel.mode).toBe('blocked');
    expect(channel.reason).toBe('peer-incapable-required');
  });

  it('treats a missing instanceId (pre-ready) as plaintext — cannot bind AAD', async () => {
    const { svc } = makeService([pairedDevice]);
    const channel = await svc.resolveViewportChannel(null, null);
    expect(channel.mode).toBe('plaintext');
  });

  it('blocks when E2EE is required and the local keypair fails to load (fail closed)', async () => {
    // Even with a usable paired device, a broken LOCAL keypair must not leak terminal
    // content in plaintext under strict mode — the frame is withheld.
    const { svc, keypair } = makeService([pairedDevice], { e2eeRequired: true });
    keypair.getOrCreate.mockRejectedValueOnce(new Error('keystore unavailable'));
    const channel = await svc.resolveViewportChannel(INSTANCE_ID, mobile.kid);
    expect(channel.mode).toBe('blocked');
    expect(channel.reason).toBe('peer-incapable-required');
    expect(channel.sealScreen).toBeUndefined();
  });

  it('blocks an owner-bound lease when the local keypair fails even if E2EE is optional', async () => {
    const { svc, keypair } = makeService([pairedDevice]);
    keypair.getOrCreate.mockRejectedValueOnce(new Error('keystore unavailable'));
    const channel = await svc.resolveViewportChannel(INSTANCE_ID, mobile.kid);
    expect(channel.mode).toBe('blocked');
    expect(channel.sealScreen).toBeUndefined();
  });

  it('seals for the exact owner kid rather than the most recently paired device', async () => {
    const other = generateX25519KeyPair(makeRng(0x4444));
    const otherSharedKey = deriveSharedKey(other.privateKey, pc.publicKey);
    const otherDevice: FakeDevice = {
      kid: other.kid,
      publicKeyB64: bytesToBase64(other.publicKey),
      trust: 'verified',
      addedAt: '2026-02-01T00:00:00.000Z',
    };
    const { svc } = makeService([pairedDevice, otherDevice]);
    const channel = await svc.resolveViewportChannel(INSTANCE_ID, mobile.kid);
    const env = (await channel.sealScreen!(SESSION_ID, 0, SCREEN)) as E2eeEnvelope;

    await expect(mobileService().open(env, openCtx(SESSION_ID, 0))).resolves.toEqual(SCREEN);
    await expect(
      mobileService(other, otherSharedKey).open(env, openCtx(SESSION_ID, 0)),
    ).rejects.toBeInstanceOf(E2eeAuthenticationError);
  });
});
