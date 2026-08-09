import {
  sessionStoppedEvent,
  sessionStoppedReasonSchema,
  sessionStoppedSourceSchema,
} from './session.stopped';

describe('session.stopped event contract', () => {
  it('accepts the approved source and reason values', () => {
    expect(
      sessionStoppedEvent.schema.safeParse({
        sessionId: 'session-1',
        source: 'mobile-rpc',
        reason: 'restart',
      }).success,
    ).toBe(true);
  });

  it('requires source and reason on newly published events', () => {
    expect(sessionStoppedEvent.schema.safeParse({ sessionId: 'session-1' }).success).toBe(false);
  });

  it('rejects values outside the closed source and reason unions', () => {
    expect(sessionStoppedSourceSchema.safeParse('api').success).toBe(false);
    expect(sessionStoppedReasonSchema.safeParse('crash').success).toBe(false);
  });
});
