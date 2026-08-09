/**
 * Canonical Phase 2 fixtures: deterministic seeds for cross-package integration
 * tests. Kept in `@devchain/shared` so the bridge (CJS) and local-app (ESM) can
 * both consume them via the same workspace package (mobile-app duplicates a
 * local subset because it does NOT depend on `@devchain/shared`).
 *
 * All fixtures are PURE DATA — no transport, no sockets, no real devices.
 */
import type { TunnelPushFrame, TunnelPushEnvelope } from '../tunnel-protocol.js';

/** A canonical instance/session/agent id triple used across Phase 2 fixtures. */
export const PHASE2_FIXTURE_IDS = Object.freeze({
  userId: 'user-fixture-1',
  instanceId: 'inst-fixture-1',
  sessionId: 'sess-fixture-1',
  agentId: 'agent-fixture-1',
  projectId: 'proj-fixture-1',
  toolUseId: 'tool-use-fixture-1',
});

/** A transcript-updated push ENVELOPE (no `eventId` — bridge assigns it). */
export const TRANSCRIPT_UPDATED_ENVELOPE: TunnelPushEnvelope = Object.freeze({
  type: 'push',
  v: 2,
  topic: `session/${PHASE2_FIXTURE_IDS.sessionId}/transcript`,
  eventType: 'updated',
  payload: { newMessageCount: 1 },
});

/** An AskUserQuestion pending push envelope. */
export const AUQ_PENDING_ENVELOPE: TunnelPushEnvelope = Object.freeze({
  type: 'push',
  v: 2,
  topic: `session/${PHASE2_FIXTURE_IDS.sessionId}`,
  eventType: 'ask_user_question.pending',
  payload: { toolUseId: PHASE2_FIXTURE_IDS.toolUseId },
});

/** An AskUserQuestion resolved push envelope. */
export const AUQ_RESOLVED_ENVELOPE: TunnelPushEnvelope = Object.freeze({
  type: 'push',
  v: 2,
  topic: `session/${PHASE2_FIXTURE_IDS.sessionId}`,
  eventType: 'ask_user_question.resolved',
  payload: { toolUseId: PHASE2_FIXTURE_IDS.toolUseId },
});

/** A presence-changed push envelope. */
export const PRESENCE_CHANGED_ENVELOPE: TunnelPushEnvelope = Object.freeze({
  type: 'push',
  v: 2,
  topic: `agent/${PHASE2_FIXTURE_IDS.agentId}`,
  eventType: 'presence',
  payload: { online: true },
});

/**
 * A session.activity.changed push envelope — rides the `session/<id>` topic (same
 * shape as the AUQ rule) with eventType `activity`. Drives the mobile busy dots.
 */
export const ACTIVITY_CHANGED_ENVELOPE: TunnelPushEnvelope = Object.freeze({
  type: 'push',
  v: 2,
  topic: `session/${PHASE2_FIXTURE_IDS.sessionId}`,
  eventType: 'activity',
  payload: { state: 'busy', lastActivityAt: 1, busySince: 0 },
});

/**
 * A syntactically-valid but UNKNOWN-topic push envelope (passes
 * `isTunnelPushFrame` structural validation, fails the allowlist). Used to
 * exercise sub-epic 11's reject-before-dispatch hardening.
 */
export const UNKNOWN_TOPIC_ENVELOPE: TunnelPushEnvelope = Object.freeze({
  type: 'push',
  v: 2,
  topic: `session/${PHASE2_FIXTURE_IDS.sessionId}/frobnicate`,
  eventType: 'updated',
  payload: {},
});

/**
 * A push envelope whose `eventType` is wrong for a known topic (passes
 * structural validation, fails the allowlist on the eventType axis). Used to
 * exercise sub-epic 11's reject-before-dispatch hardening.
 */
export const WRONG_EVENT_TYPE_ENVELOPE: TunnelPushEnvelope = Object.freeze({
  type: 'push',
  v: 2,
  topic: `session/${PHASE2_FIXTURE_IDS.sessionId}/transcript`,
  eventType: 'ask_user_question.pending', // wrong for a transcript topic
  payload: {},
});

/**
 * An envelope smuggled with a client-supplied `eventId`. The bridge MUST strip
 * it before SSE fan-out (the delivered SSE id is bridge-assigned). This fixture
 * is intentionally a full {@link TunnelPushFrame} (with id) so the test can
 * assert the id is NOT preserved on the SSE wire.
 */
export const SMUGGLED_EVENT_ID_FRAME: TunnelPushFrame = Object.freeze({
  type: 'push',
  v: 2,
  topic: `session/${PHASE2_FIXTURE_IDS.sessionId}/transcript`,
  eventType: 'updated',
  eventId: 'client-smuggled-999',
  payload: { trap: true },
});

/** Canonical allowlisted (topic, eventType) pairs — mirrors the allowlist. */
export const ALLOWLISTED_TOPIC_PAIRS: ReadonlyArray<readonly [string, string]> = Object.freeze([
  [`session/${PHASE2_FIXTURE_IDS.sessionId}/transcript`, 'updated'],
  [`session/${PHASE2_FIXTURE_IDS.sessionId}`, 'ask_user_question.pending'],
  [`session/${PHASE2_FIXTURE_IDS.sessionId}`, 'ask_user_question.resolved'],
  [`session/${PHASE2_FIXTURE_IDS.sessionId}`, 'activity'],
  [`agent/${PHASE2_FIXTURE_IDS.agentId}`, 'presence'],
  // Phase 1 / Task 3 addition (RC4):
  [`project/${PHASE2_FIXTURE_IDS.projectId}/state`, 'agent.created'],
  [`project/${PHASE2_FIXTURE_IDS.projectId}/state`, 'agent.deleted'],
]);
