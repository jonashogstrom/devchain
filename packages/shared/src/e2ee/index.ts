// @devchain/shared/e2ee — versioned E2EE envelope + the seal/open service.
// Shared verbatim by Node (PC) and Hermes (mobile); key material + RNG are injected.

export {
  E2EE_KEY_BYTES,
  E2EE_NONCE_BYTES,
  E2EE_ENVELOPE_VERSION,
  E2EE_ALG_XCHACHA20POLY1305,
  E2eeError,
  E2eeMalformedEnvelopeError,
  E2eeUnsupportedVersionError,
  E2eeUnsupportedAlgError,
  E2eeUnknownKeyError,
  E2eeAuthenticationError,
  E2eeInvalidKeyError,
  isE2eeEnvelope,
  type E2eeEnvelope,
  type E2eeEnvelopeVersion,
  type E2eeAlg,
  type E2eeRecipient,
  type E2eeLane,
  type E2eeDirection,
  type E2eeContext,
  type E2eeKeyProvider,
  type SealKey,
  type KeyLookup,
  type RandomBytes,
} from './envelope.js';

export { buildAad } from './aad.js';
export { bytesToBase64, base64ToBytes, InvalidBase64Error } from './base64.js';
export { CryptoEnvelopeService } from './crypto-envelope.service.js';
export {
  X25519_PRIVATE_KEY_BYTES,
  X25519_PUBLIC_KEY_BYTES,
  E2EE_KID_BYTES,
  deriveKid,
  generateX25519KeyPair,
  fromX25519PrivateKey,
  type E2eeKeyPair,
} from './keypair.js';
export {
  E2EE_SHARED_KEY_BYTES,
  E2EE_HKDF_INFO,
  E2EE_HKDF_SALT,
  PAIRING_SECRET_BYTES,
  PAIRING_MAC_BYTES,
  deriveSharedKey,
  buildPairingTranscript,
  computePairingMac,
  verifyPairingMac,
  type PairingTranscriptInput,
} from './key-exchange.js';
export {
  isE2eeVerified,
  reconcilePeerKey,
  markVerifiedViaSafetyNumber,
  type E2eeTrustStatus,
  type E2eeVerificationMethod,
  type E2eeAdoptionMethod,
  type E2eeTrustRecord,
  type IncomingPeerKey,
} from './trust.js';
export { E2EE_SAFETY_NUMBER_GROUPS, deriveSafetyNumber } from './safety-number.js';
export {
  E2EE_NEGOTIATION_VERSION,
  WORKSPACE_SUPPORT_VERSION,
  isWorkspaceSupportCapability,
  buildWorkspaceSupportCapability,
  isE2eeCapability,
  isCapable,
  negotiateE2ee,
  buildE2eeCapability,
  type E2eeCapability,
  type E2eeNegotiationMode,
  type E2eeNegotiationReason,
  type E2eeNegotiationResult,
  type WorkspaceSupportCapability,
} from './negotiation.js';
