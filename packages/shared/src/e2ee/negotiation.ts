// Shared E2EE capability negotiation (Phase-1 Task:5).
//
// Decides whether a PC↔mobile pair turns content encryption ON, falls back to plaintext
// (with a VISIBLE "not end-to-end encrypted" state), or FAILS CLOSED — with NO silent
// downgrade. The PC advertises its descriptor on the existing tunnel attest handshake; the
// bridge relays it; the mobile reads it off the instance listing. This module is pure
// types/constants + a pure decision fn — the transport wiring is platform-specific, and
// the mobile mirrors it via the accepted contract-test pattern (no prod dep on this pkg).

/** Schema version of the capability descriptor — lets peers evolve it without crashing. */
export const E2EE_NEGOTIATION_VERSION = 1;

/** Highest workspace-RPC capability version understood by this release. */
export const WORKSPACE_SUPPORT_VERSION = 1;

/** Optional attest capability. Absence means a legacy implicit-Default installation. */
export interface WorkspaceSupportCapability {
  readonly v: number;
}

export function isWorkspaceSupportCapability(value: unknown): value is WorkspaceSupportCapability {
  if (typeof value !== 'object' || value === null) return false;
  const version = (value as Record<string, unknown>).v;
  return (
    typeof version === 'number' &&
    Number.isInteger(version) &&
    version >= 1 &&
    version <= WORKSPACE_SUPPORT_VERSION
  );
}

export function buildWorkspaceSupportCapability(): WorkspaceSupportCapability {
  return { v: WORKSPACE_SUPPORT_VERSION };
}

// Inlined (NOT imported from ./envelope) so this module carries no runtime cross-file
// `.js` specifier — that keeps it resolvable under the local-app jest shim, which does
// not rewrite ESM `.js` imports (same constraint key-exchange.ts follows). MUST equal
// `E2EE_ENVELOPE_VERSION` in ./envelope.ts — drift is caught by negotiation.spec.ts.
const ENVELOPE_VERSION = 1;

/**
 * What one endpoint advertises about its E2EE capability. The PC fills
 * `keyFingerprint`/`publicKeyB64` (its dedicated X25519 key) so the mobile can adopt it
 * (email TOFU); a mobile descriptor may omit them. `e2eeRequired` is a per-endpoint
 * POLICY: when true, that endpoint refuses to run in plaintext (fail closed).
 */
export interface E2eeCapability {
  /** Descriptor schema version (forward-compat; an unknown/newer value → treated as incapable). */
  v: number;
  /** Highest envelope version this endpoint can seal/open. */
  envelopeVersion: number;
  /** Whether this endpoint can do E2EE at all. */
  e2eeSupported: boolean;
  /** Policy: refuse to send content in plaintext against an incapable peer. */
  e2eeRequired: boolean;
  /** Key id (== `deriveKid` of the public key) — the fingerprint. Present iff supported. */
  keyFingerprint?: string;
  /** base64 raw 32-byte X25519 public key — present iff supported (drives email TOFU adopt). */
  publicKeyB64?: string;
}

/** The negotiated channel outcome for a pair. */
export type E2eeNegotiationMode = 'encrypted' | 'plaintext' | 'blocked';

/** Machine-readable negotiation reason for logging + UX. */
export type E2eeNegotiationReason =
  | 'both-capable'
  | 'peer-incapable-required'
  | 'self-incapable-required'
  | 'downgrade-blocked'
  | 'plaintext-mixed';

export interface E2eeNegotiationResult {
  mode: E2eeNegotiationMode;
  /** True when content MUST NOT be sent (fail-closed): a required side faces an incapable
   *  peer, or a previously-keyed pair would otherwise silently downgrade. */
  failClosed: boolean;
  /** True when the channel runs in plaintext and the UI must show "not end-to-end encrypted". */
  plaintextFallback: boolean;
  reason: E2eeNegotiationReason;
}

/** Whether a descriptor is structurally a usable capability (forward-compatible). */
export function isE2eeCapability(value: unknown): value is E2eeCapability {
  if (typeof value !== 'object' || value === null) return false;
  const c = value as Record<string, unknown>;
  return (
    typeof c.v === 'number' &&
    typeof c.envelopeVersion === 'number' &&
    typeof c.e2eeSupported === 'boolean' &&
    typeof c.e2eeRequired === 'boolean'
  );
}

/**
 * An endpoint counts as E2EE-capable only when it advertises a descriptor THIS build
 * understands (`v <= E2EE_NEGOTIATION_VERSION`) AND `e2eeSupported`. An unknown/newer
 * descriptor version degrades to "not capable" instead of crashing (graceful
 * unknown-version handling) — encryption never turns on against a descriptor we can't
 * fully parse.
 */
export function isCapable(cap: E2eeCapability | null | undefined): boolean {
  return (
    !!cap &&
    cap.e2eeSupported === true &&
    cap.v <= E2EE_NEGOTIATION_VERSION &&
    cap.envelopeVersion >= 1
  );
}

/**
 * Decide the channel mode for a (self, peer) pair — pure, no I/O, NO SILENT DOWNGRADE.
 *
 * - both capable → `'encrypted'`.
 * - either side `e2eeRequired` while the OTHER is incapable → `'blocked'` (failClosed):
 *   the required policy refuses plaintext.
 * - a key ALREADY exists for the pair but it would no longer be encrypted → `'blocked'`
 *   (failClosed): never silently drop to plaintext once paired+capable.
 * - otherwise (no required policy, no prior key) → `'plaintext'` with a visible
 *   "not E2EE" indicator.
 */
export function negotiateE2ee(
  self: E2eeCapability,
  peer: E2eeCapability | null | undefined,
  opts: { hasExistingKey?: boolean } = {},
): E2eeNegotiationResult {
  const selfCapable = isCapable(self);
  const peerCapable = isCapable(peer);

  if (selfCapable && peerCapable) {
    return {
      mode: 'encrypted',
      failClosed: false,
      plaintextFallback: false,
      reason: 'both-capable',
    };
  }
  // A required endpoint facing an incapable peer must fail closed (no plaintext content).
  if (self.e2eeRequired && !peerCapable) {
    return {
      mode: 'blocked',
      failClosed: true,
      plaintextFallback: false,
      reason: 'peer-incapable-required',
    };
  }
  if (peer?.e2eeRequired && !selfCapable) {
    return {
      mode: 'blocked',
      failClosed: true,
      plaintextFallback: false,
      reason: 'self-incapable-required',
    };
  }
  // Never silently downgrade a pair that already established a shared key.
  if (opts.hasExistingKey) {
    return {
      mode: 'blocked',
      failClosed: true,
      plaintextFallback: false,
      reason: 'downgrade-blocked',
    };
  }
  // Mixed old/new clients, no required policy, no prior key → plaintext WITH a visible
  // "not end-to-end encrypted" indicator (the caller surfaces it).
  return {
    mode: 'plaintext',
    failClosed: false,
    plaintextFallback: true,
    reason: 'plaintext-mixed',
  };
}

/**
 * Build this endpoint's capability descriptor. A `key` of `null`/omitted advertises
 * "not supported" (no fingerprint / pubkey leaked).
 */
export function buildE2eeCapability(opts: {
  e2eeRequired?: boolean;
  key?: { kid: string; publicKeyB64: string } | null;
}): E2eeCapability {
  const supported = !!opts.key;
  return {
    v: E2EE_NEGOTIATION_VERSION,
    envelopeVersion: ENVELOPE_VERSION,
    e2eeSupported: supported,
    e2eeRequired: !!opts.e2eeRequired,
    ...(supported ? { keyFingerprint: opts.key!.kid, publicKeyB64: opts.key!.publicKeyB64 } : {}),
  };
}
