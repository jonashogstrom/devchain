import { describe, it, expect } from 'vitest';
import {
  E2EE_NEGOTIATION_VERSION,
  isE2eeCapability,
  isCapable,
  negotiateE2ee,
  buildE2eeCapability,
  buildWorkspaceSupportCapability,
  isWorkspaceSupportCapability,
  WORKSPACE_SUPPORT_VERSION,
  type E2eeCapability,
} from './negotiation';
import { E2EE_ENVELOPE_VERSION } from './envelope';

const capable = (over: Partial<E2eeCapability> = {}): E2eeCapability => ({
  v: E2EE_NEGOTIATION_VERSION,
  envelopeVersion: E2EE_ENVELOPE_VERSION,
  e2eeSupported: true,
  e2eeRequired: false,
  keyFingerprint: 'kid-1',
  publicKeyB64: 'AAAA',
  ...over,
});

const incapable = (over: Partial<E2eeCapability> = {}): E2eeCapability => ({
  v: E2EE_NEGOTIATION_VERSION,
  envelopeVersion: E2EE_ENVELOPE_VERSION,
  e2eeSupported: false,
  e2eeRequired: false,
  ...over,
});

describe('workspace support capability', () => {
  it('builds and accepts the current version', () => {
    expect(buildWorkspaceSupportCapability()).toEqual({ v: WORKSPACE_SUPPORT_VERSION });
    expect(isWorkspaceSupportCapability({ v: WORKSPACE_SUPPORT_VERSION })).toBe(true);
  });

  it('treats absence, malformed values, and unknown versions as unsupported', () => {
    expect(isWorkspaceSupportCapability(undefined)).toBe(false);
    expect(isWorkspaceSupportCapability({})).toBe(false);
    expect(isWorkspaceSupportCapability({ v: 0 })).toBe(false);
    expect(isWorkspaceSupportCapability({ v: WORKSPACE_SUPPORT_VERSION + 1 })).toBe(false);
    expect(isWorkspaceSupportCapability({ v: 1.5 })).toBe(false);
  });
});

describe('buildE2eeCapability', () => {
  it('advertises supported + fingerprint/pubkey when a key is given', () => {
    const cap = buildE2eeCapability({ key: { kid: 'k', publicKeyB64: 'P' } });
    expect(cap).toEqual({
      v: E2EE_NEGOTIATION_VERSION,
      envelopeVersion: E2EE_ENVELOPE_VERSION,
      e2eeSupported: true,
      e2eeRequired: false,
      keyFingerprint: 'k',
      publicKeyB64: 'P',
    });
  });

  it('advertises not-supported with no key material leaked when no key', () => {
    const cap = buildE2eeCapability({ key: null });
    expect(cap.e2eeSupported).toBe(false);
    expect(cap.keyFingerprint).toBeUndefined();
    expect(cap.publicKeyB64).toBeUndefined();
  });

  it('carries the required policy', () => {
    expect(buildE2eeCapability({ e2eeRequired: true, key: null }).e2eeRequired).toBe(true);
  });
});

describe('isE2eeCapability / isCapable', () => {
  it('accepts a structurally valid descriptor', () => {
    expect(isE2eeCapability(capable())).toBe(true);
  });

  it('rejects junk', () => {
    expect(isE2eeCapability(null)).toBe(false);
    expect(isE2eeCapability({ v: 1 })).toBe(false);
    expect(isE2eeCapability('nope')).toBe(false);
  });

  it('treats a newer/unknown descriptor version as NOT capable (graceful)', () => {
    expect(isCapable(capable({ v: E2EE_NEGOTIATION_VERSION + 1 }))).toBe(false);
  });

  it('treats unsupported as not capable', () => {
    expect(isCapable(incapable())).toBe(false);
    expect(isCapable(null)).toBe(false);
  });
});

describe('negotiateE2ee — capability matrix', () => {
  it('both capable → encrypted', () => {
    const r = negotiateE2ee(capable(), capable());
    expect(r.mode).toBe('encrypted');
    expect(r.failClosed).toBe(false);
    expect(r.plaintextFallback).toBe(false);
    expect(r.reason).toBe('both-capable');
  });

  it('mixed (one incapable), no required, no prior key → plaintext + visible indicator', () => {
    const r = negotiateE2ee(capable(), incapable());
    expect(r.mode).toBe('plaintext');
    expect(r.failClosed).toBe(false);
    expect(r.plaintextFallback).toBe(true);
    expect(r.reason).toBe('plaintext-mixed');
  });

  it('self requires E2EE but peer incapable → blocked (fail closed)', () => {
    const r = negotiateE2ee(capable({ e2eeRequired: true }), incapable());
    expect(r.mode).toBe('blocked');
    expect(r.failClosed).toBe(true);
    expect(r.plaintextFallback).toBe(false);
    expect(r.reason).toBe('peer-incapable-required');
  });

  it('peer requires E2EE but self incapable → blocked (fail closed)', () => {
    const r = negotiateE2ee(incapable(), capable({ e2eeRequired: true }));
    expect(r.mode).toBe('blocked');
    expect(r.failClosed).toBe(true);
    expect(r.reason).toBe('self-incapable-required');
  });

  it('NEVER silently downgrades a pair that already has a key → blocked', () => {
    const r = negotiateE2ee(capable(), incapable(), { hasExistingKey: true });
    expect(r.mode).toBe('blocked');
    expect(r.failClosed).toBe(true);
    expect(r.reason).toBe('downgrade-blocked');
  });

  it('an existing key with both still capable stays encrypted (no false downgrade)', () => {
    const r = negotiateE2ee(capable(), capable(), { hasExistingKey: true });
    expect(r.mode).toBe('encrypted');
  });

  it('a newer peer descriptor version is treated as incapable (graceful) → plaintext', () => {
    const r = negotiateE2ee(capable(), capable({ v: E2EE_NEGOTIATION_VERSION + 1 }));
    expect(r.mode).toBe('plaintext');
    expect(r.plaintextFallback).toBe(true);
  });

  it('required side + newer/unknown peer version → blocked (no encrypt against unparsable)', () => {
    const r = negotiateE2ee(
      capable({ e2eeRequired: true }),
      capable({ v: E2EE_NEGOTIATION_VERSION + 5 }),
    );
    expect(r.mode).toBe('blocked');
    expect(r.failClosed).toBe(true);
  });
});
