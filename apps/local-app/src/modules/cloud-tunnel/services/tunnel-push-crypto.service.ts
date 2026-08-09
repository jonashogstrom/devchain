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
} from '@devchain/shared';
import { createLogger } from '../../../common/logging/logger';
import { E2eeKeypairService } from '../../e2ee/services/e2ee-keypair.service';
import {
  E2eeDeviceStoreService,
  type E2eePeerDevice,
} from '../../e2ee/services/e2ee-device-store.service';
import { E2EE_REQUIRED_POLICY } from './tunnel-rpc-crypto.service';

const logger = createLogger('TunnelPushCrypto');

/**
 * How push content may travel to the paired mobile RIGHT NOW:
 *  - `encrypted` — both sides E2EE-capable: every payload is sealed (`seal` is present).
 *  - `plaintext` — no E2EE-capable peer / no prior key: HINT frames ride plaintext, but the
 *    caller MUST withhold content-bearing frames (no plaintext content over push).
 *  - `blocked`   — the PC `e2eeRequired` policy faces an incapable peer: withhold EVERYTHING.
 */
export type PushChannelMode = 'encrypted' | 'plaintext' | 'blocked';

export interface PushChannel {
  mode: PushChannelMode;
  reason: E2eeNegotiationReason;
  /**
   * Present iff `mode === 'encrypted'`: seal one push payload, binding `topic`+`eventType`
   * (NOT the bridge-assigned `eventId`) into the AEAD's AAD via {@link pushRouteKey}.
   */
  seal?: (topic: string, eventType: string, payload: unknown) => Promise<E2eeEnvelope>;
}

/**
 * Build the push-lane AAD `routeKey` from the cleartext routing fields. A ciphertext is
 * thereby bound to the exact `(topic, eventType)` it was produced for — replaying it onto a
 * different topic/eventType fails the tag check. MUST stay byte-identical to the mobile
 * opener's `pushRouteKey` (a cross-side contract test exercises the round trip).
 */
export function pushRouteKey(topic: string, eventType: string): string {
  return `${topic}|${eventType}`;
}

/**
 * PC-side push transport-encryption seam (Phase 3, Task:1).
 *
 * The push lane is mostly hints, but it carries real content today (`ask_user_question.pending`
 * question text, transcript deltas, and agent names). This service resolves whether the lane can
 * encrypt to the paired mobile and, when it can, seals each push `payload` into an
 * {@link E2eeEnvelope} — keeping `type`/`v`/`topic`/`eventType` cleartext for the bridge's
 * routing + allowlist. It mirrors {@link TunnelRpcCryptoService} (same key model: the pairwise
 * shared key is re-derived on demand from the PC private key + the paired device's public key,
 * never persisted; results seal under THIS PC's kid so the phone resolves the same key).
 *
 * Auth-then-encrypt: the forwarder's source-side scope auth (`isFrameInScope`) runs FIRST; this
 * only encrypts the already-authorized payload.
 */
@Injectable()
export class TunnelPushCryptoService {
  constructor(
    private readonly keypair: E2eeKeypairService,
    private readonly deviceStore: E2eeDeviceStoreService,
    // PC-side E2EE-required policy (shared with the RPC seam). When true, a push to an
    // incapable peer is `blocked` (withheld) rather than sent in plaintext.
    @Optional() @Inject(E2EE_REQUIRED_POLICY) private readonly e2eeRequired: boolean = false,
  ) {}

  /** node:crypto CSPRNG, adapted to the injected `(n) => Uint8Array` contract. */
  private readonly randomBytes = (n: number): Uint8Array => new Uint8Array(nodeRandomBytes(n));

  /**
   * Decide how push content may travel to the paired mobile and, when encrypted, return a
   * per-route `seal`. `instanceId` (the bridge-assigned id this tunnel belongs to) binds the
   * AEAD's AAD; without it (pre-`ready`) the lane can't seal, so the result is `plaintext`
   * (HINTs still flow; the caller withholds content-bearing frames). Never throws — a crypto
   * lookup failure fails toward `plaintext` so a stray error can't leak content.
   */
  async resolvePushChannel(instanceId: string | null): Promise<PushChannel> {
    if (!instanceId) {
      return { mode: 'plaintext', reason: 'plaintext-mixed' };
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
      // Our own key is unavailable → we cannot seal. Under the strict `e2eeRequired`
      // policy this MUST fail closed (`blocked` → the forwarder withholds EVERYTHING,
      // hint frames included): a broken keypair must never leak even a hint in plaintext.
      // When E2EE is optional, fail toward withholding CONTENT only — the caller still
      // drops content-bearing frames in `plaintext` mode but lets hints ride (back-compat),
      // mirroring the negotiated incapable-peer path below.
      if (this.e2eeRequired) {
        logger.warn({ err }, 'E2EE keypair unavailable — push BLOCKED (E2EE required)');
        return { mode: 'blocked', reason: 'peer-incapable-required' };
      }
      logger.warn(
        { err },
        'E2EE keypair unavailable — push content withheld (plaintext hints only)',
      );
      return { mode: 'plaintext', reason: 'plaintext-mixed' };
    }

    const device = this.selectPeerDevice();
    // The PC's view of "peer capable" is "a usable paired device key exists" — the phone
    // could only have paired by being E2EE-capable. We don't know the phone's own
    // `e2eeRequired` (irrelevant here: the PC is always capable, so the `self-incapable`
    // branch can't fire), so advertise it as a plain capable peer.
    const peerCap: E2eeCapability | null = device
      ? { v: 1, envelopeVersion: 1, e2eeSupported: true, e2eeRequired: false }
      : null;

    const neg = negotiateE2ee(selfCap, peerCap, { hasExistingKey: !!device });

    if (neg.mode !== 'encrypted' || !device) {
      return { mode: neg.mode, reason: neg.reason };
    }

    // Encrypted: derive the pairwise shared key for the selected device and seal under THIS
    // PC's kid so the phone maps it to the same shared key (mirrors the RPC pc→mobile path).
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
      seal: (topic, eventType, payload) =>
        service.seal(payload, this.ctx(instanceId, topic, eventType)),
    };
  }

  private ctx(instanceId: string, topic: string, eventType: string): E2eeContext {
    return {
      lane: 'push',
      direction: 'pc-to-mobile',
      instanceId,
      routeKey: pushRouteKey(topic, eventType),
    };
  }

  /**
   * Choose the single peer device to seal push for. v1 envelopes are single-recipient
   * (multi-device fan-out is the reserved `E2eeEnvelope.recipients` slot), so when more than
   * one device is paired we deterministically pick the most recently added usable one and log
   * — the others can't open the frame and safely fall back to per-topic catch-up (push is a
   * hint, never authoritative). Returns `null` when no usable device is paired.
   */
  private selectPeerDevice(): E2eePeerDevice | null {
    const usable = this.deviceStore.list().filter((d) => this.isUsable(d));
    if (usable.length === 0) return null;
    if (usable.length === 1) return usable[0];
    const [latest] = [...usable].sort((a, b) => (a.addedAt < b.addedAt ? 1 : -1));
    logger.debug(
      { count: usable.length, kid: latest.kid },
      'Multiple paired devices — sealing push for the most recently added (v1 single-recipient)',
    );
    return latest;
  }

  /** A device is usable for sealing when it isn't revoked and carries a valid X25519 pubkey. */
  private isUsable(device: E2eePeerDevice): boolean {
    if (device.trust === 'revoked') return false;
    try {
      return base64ToBytes(device.publicKeyB64).length === X25519_PUBLIC_KEY_BYTES;
    } catch {
      return false;
    }
  }
}
