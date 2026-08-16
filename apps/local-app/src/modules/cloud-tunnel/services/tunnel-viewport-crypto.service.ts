import { Injectable, Inject, Optional } from '@nestjs/common';
import { randomBytes as nodeRandomBytes } from 'crypto';
import {
  CryptoEnvelopeService,
  base64ToBytes,
  deriveSharedKey,
  buildE2eeCapability,
  negotiateE2ee,
  X25519_PUBLIC_KEY_BYTES,
  type E2eeCapability,
  type E2eeContext,
  type E2eeEnvelope,
  type E2eeKeyProvider,
  type E2eeNegotiationReason,
  type ViewportScreen,
} from '@devchain/shared';
import { createLogger } from '../../../common/logging/logger';
import { E2eeKeypairService } from '../../e2ee/services/e2ee-keypair.service';
import {
  E2eeDeviceStoreService,
  type E2eePeerDevice,
} from '../../e2ee/services/e2ee-device-store.service';
import { E2EE_REQUIRED_POLICY } from './tunnel-rpc-crypto.service';

const logger = createLogger('TunnelViewportCrypto');

/**
 * How a viewport frame may travel to the paired mobile RIGHT NOW:
 *  - `encrypted` — both sides E2EE-capable: the full screen is sealed (`sealScreen` present).
 *  - `plaintext` — an ownerless legacy lease may stream existing plaintext full/diff frames.
 *  - `blocked`   — an owner-bound lane cannot seal, or strict policy forbids plaintext.
 */
export type ViewportChannelMode = 'encrypted' | 'plaintext' | 'blocked';

export interface ViewportChannel {
  mode: ViewportChannelMode;
  reason: E2eeNegotiationReason;
  /**
   * Present iff `mode === 'encrypted'`: seal a full {@link ViewportScreen}, binding
   * `lane:'viewport'` + `routeKey:sessionId` + the frame `seq` into the AEAD's AAD.
   */
  sealScreen?: (sessionId: string, seq: number, screen: ViewportScreen) => Promise<E2eeEnvelope>;
}

/**
 * PC-side viewport transport-encryption seam.
 *
 * The live tmux screen can contain secrets, so the viewport `body` is sealed before it leaves
 * the local-app — the bridge then routes/buffers the latest OPAQUE full frame and never reads
 * screen content. This mirrors {@link TunnelPushCryptoService} / {@link TunnelRpcCryptoService}
 * (same key model: the pairwise shared key is re-derived on demand from the PC private key +
 * the paired device public key, never persisted; sealed under THIS PC's kid so the phone
 * resolves the same key). v1 encrypted viewport is FULL-FRAME-ONLY — the streamer seals each
 * full screen; bridge-side diff folding is dropped for encrypted frames.
 *
 */
@Injectable()
export class TunnelViewportCryptoService {
  constructor(
    private readonly keypair: E2eeKeypairService,
    private readonly deviceStore: E2eeDeviceStoreService,
    @Optional() @Inject(E2EE_REQUIRED_POLICY) private readonly e2eeRequired: boolean = false,
  ) {}

  /** node:crypto CSPRNG, adapted to the injected `(n) => Uint8Array` contract. */
  private readonly randomBytes = (n: number): Uint8Array => new Uint8Array(nodeRandomBytes(n));

  /**
   * Resolve a channel for exactly `ownerKid`, never another paired device. An owner-bound lane
   * fails closed when its key or tunnel instance is unavailable; only an ownerless legacy lane
   * may use plaintext while the optional-E2EE policy permits it.
   */
  async resolveViewportChannel(
    instanceId: string | null,
    ownerKid: string | null,
  ): Promise<ViewportChannel> {
    if (!instanceId) {
      return ownerKid || this.e2eeRequired
        ? { mode: 'blocked', reason: 'peer-incapable-required' }
        : { mode: 'plaintext', reason: 'plaintext-mixed' };
    }

    let pcKid: string;
    let pcPrivateKey: Uint8Array;
    let selfCap: E2eeCapability;
    try {
      const kp = await this.keypair.getOrCreate();
      pcKid = kp.kid;
      pcPrivateKey = kp.privateKey;
      selfCap = buildE2eeCapability({
        e2eeRequired: this.e2eeRequired,
        key: { kid: kp.kid, publicKeyB64: Buffer.from(kp.publicKey).toString('base64') },
      });
    } catch (err) {
      // An owner-bound lane must never downgrade when its key material disappears. The
      // ownerless compatibility lane may fall back only while strict policy is disabled.
      if (ownerKid || this.e2eeRequired) {
        logger.warn({ err }, 'E2EE keypair unavailable — viewport blocked');
        return { mode: 'blocked', reason: 'peer-incapable-required' };
      }
      logger.warn({ err }, 'E2EE keypair unavailable — viewport falls back to plaintext');
      return { mode: 'plaintext', reason: 'plaintext-mixed' };
    }

    if (!ownerKid) {
      return this.e2eeRequired
        ? { mode: 'blocked', reason: 'peer-incapable-required' }
        : { mode: 'plaintext', reason: 'plaintext-mixed' };
    }

    const candidate = this.deviceStore.get(ownerKid);
    const device = candidate && this.isUsable(candidate) ? candidate : null;
    const peerCap: E2eeCapability | null = device
      ? { v: 1, envelopeVersion: 1, e2eeSupported: true, e2eeRequired: false }
      : null;

    const neg = negotiateE2ee(selfCap, peerCap, { hasExistingKey: !!device });

    if (neg.mode !== 'encrypted' || !device) {
      return { mode: 'blocked', reason: 'peer-incapable-required' };
    }

    const devicePub = base64ToBytes(device.publicKeyB64);
    const sharedKey = deriveSharedKey(pcPrivateKey, devicePub);
    const provider: E2eeKeyProvider = {
      resolveSealKey: () => ({ kid: pcKid, key: sharedKey }),
      getKeyById: (kid) => (kid === pcKid || kid === device.kid ? sharedKey : undefined),
    };
    const service = new CryptoEnvelopeService(provider, this.randomBytes);

    return {
      mode: 'encrypted',
      reason: neg.reason,
      sealScreen: (sessionId, seq, screen) =>
        service.seal(screen, this.ctx(instanceId, sessionId, seq)),
    };
  }

  private ctx(instanceId: string, sessionId: string, seq: number): E2eeContext {
    return {
      lane: 'viewport',
      direction: 'pc-to-mobile',
      instanceId,
      // The viewport lane's natural routing key is the sessionId; the per-stream monotonic
      // `seq` is bound too so a frame can't be replayed at a different position.
      routeKey: sessionId,
      seq,
    };
  }

  private isUsable(device: E2eePeerDevice): boolean {
    if (device.trust === 'revoked') return false;
    try {
      return base64ToBytes(device.publicKeyB64).length === X25519_PUBLIC_KEY_BYTES;
    } catch {
      return false;
    }
  }
}
