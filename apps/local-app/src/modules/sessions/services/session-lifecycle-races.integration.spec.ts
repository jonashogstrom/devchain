// Backend integration: real in-memory SQLite is the cheapest layer that proves
// lifecycle publication windows and persisted row cardinality under contention.
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { SessionCoordinatorService } from './session-coordinator.service';
import { SessionsService } from './sessions.service';
import { SessionLaunchPipeline } from './session-runtime/session-launch-pipeline.service';
import { SessionRestorePipeline } from './session-runtime/session-restore-pipeline.service';
import { SessionRuntime } from './session-runtime';
import { SessionLifecycleFacade } from './session-lifecycle-facade.service';
import {
  fakeAgent,
  fakeProfile,
  fakeProfileProviderConfig,
  fakeProject,
  fakeProvider,
} from './session-runtime/__test-utils__/pipeline-harness';

jest.mock('../../../common/logging/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

interface Deferred {
  promise: Promise<void>;
  resolve: () => void;
}

function deferred(): Deferred {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function waitFor(check: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (check()) return;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  throw new Error('Timed out waiting for lifecycle checkpoint');
}

const AGENT_ID = '11111111-1111-4111-8111-111111111111';
const PROJECT_ID = '22222222-2222-4222-8222-222222222222';
const RESTORE_SESSION_ID = '33333333-3333-4333-8333-333333333333';
const NOW = '2026-08-08T18:00:00.000Z';
const TEST_TERMINATION = { source: 'web-api' as const, reason: 'user-requested' as const };

describe('session lifecycle race serialization', () => {
  let sqlite: Database.Database;
  let db: BetterSQLite3Database;
  let coordinator: SessionCoordinatorService;
  let sessionsService: SessionsService;
  let sessionRuntime: SessionRuntime;
  let facade: SessionLifecycleFacade;
  let createGate: Deferred | null;
  let nowMs: number;
  let liveTmux: Set<string>;

  let terminalIO: {
    createEmptySession: jest.Mock;
    destroySession: jest.Mock;
    destroyExpectedSession: jest.Mock;
    setAlternateScreen: jest.Mock;
    typeCommand: jest.Mock;
    waitForOutput: jest.Mock;
    deliver: jest.Mock;
    deliverImmediate: jest.Mock;
    sessionExists: jest.Mock;
    startHealthCheck: jest.Mock;
  };
  let ptyService: { startStreaming: jest.Mock; stopStreaming: jest.Mock };
  let terminalSessionRegistry: {
    create: jest.Mock;
    bind: jest.Mock;
    dispose: jest.Mock;
    get: jest.Mock;
  };
  let eventsService: { publish: jest.Mock };
  let runtimeContextCapture: {
    rotateEpoch: jest.Mock;
    clear: jest.Mock;
    snapshot: jest.Mock;
    restoreSnapshot: jest.Mock;
  };
  let claudeLaunchSettings: {
    prepare: jest.Mock;
    cleanupSession: jest.Mock;
    cleanupSessionSync: jest.Mock;
  };
  let codexPluginProfiles: {
    prepare: jest.Mock;
    buildHelperArgv: jest.Mock;
    awaitAcknowledgement: jest.Mock;
    cleanupPrepared: jest.Mock;
    cleanupSession: jest.Mock;
  };

  beforeEach(() => {
    sqlite = new Database(':memory:');
    sqlite.exec(`
      CREATE TABLE sessions (
        id TEXT PRIMARY KEY,
        epic_id TEXT,
        agent_id TEXT,
        tmux_session_id TEXT,
        provider_session_id TEXT,
        provider_name_at_launch TEXT,
        status TEXT NOT NULL,
        started_at TEXT NOT NULL,
        ended_at TEXT,
        last_activity_at TEXT,
        activity_state TEXT,
        busy_since TEXT,
        transcript_path TEXT,
        size_bytes INTEGER,
        name TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
    db = drizzle(sqlite);
    coordinator = new SessionCoordinatorService();
    createGate = null;
    nowMs = Date.parse(NOW);
    liveTmux = new Set<string>();
    jest.spyOn(Date, 'now').mockImplementation(() => nowMs);

    terminalIO = {
      createEmptySession: jest.fn().mockImplementation(async (name: string) => {
        const gate = createGate;
        createGate = null;
        if (gate) await gate.promise;
        liveTmux.add(name);
        return { name };
      }),
      destroySession: jest.fn().mockImplementation(async ({ name }: { name: string }) => {
        liveTmux.delete(name);
      }),
      destroyExpectedSession: jest.fn().mockImplementation(async ({ name }: { name: string }) => {
        if (!liveTmux.delete(name)) return { outcome: 'known-absent' };
        return { outcome: 'destroyed' };
      }),
      setAlternateScreen: jest.fn().mockResolvedValue(undefined),
      typeCommand: jest.fn().mockResolvedValue(undefined),
      waitForOutput: jest.fn().mockImplementation(async () => {
        nowMs += 7_000;
        return true;
      }),
      deliver: jest.fn().mockResolvedValue(undefined),
      deliverImmediate: jest.fn().mockResolvedValue(undefined),
      sessionExists: jest
        .fn()
        .mockImplementation(async ({ name }: { name: string }) => liveTmux.has(name)),
      startHealthCheck: jest.fn(),
    };
    ptyService = {
      startStreaming: jest.fn().mockResolvedValue(undefined),
      stopStreaming: jest.fn(),
    };
    terminalSessionRegistry = {
      create: jest.fn(),
      bind: jest.fn(),
      dispose: jest.fn(),
      get: jest.fn().mockReturnValue(undefined),
    };
    eventsService = { publish: jest.fn().mockResolvedValue(undefined) };
    runtimeContextCapture = {
      rotateEpoch: jest.fn().mockReturnValue('epoch-1'),
      clear: jest.fn(),
      snapshot: jest.fn().mockReturnValue(null),
      restoreSnapshot: jest.fn(),
    };
    claudeLaunchSettings = {
      prepare: jest.fn().mockResolvedValue({
        optionArgs: [],
        runtimeEnv: {},
        captureEnabled: false,
      }),
      cleanupSession: jest.fn().mockResolvedValue(undefined),
      cleanupSessionSync: jest.fn(),
    };
    codexPluginProfiles = {
      prepare: jest.fn().mockResolvedValue(null),
      buildHelperArgv: jest.fn(),
      awaitAcknowledgement: jest.fn().mockResolvedValue('/tmp/codex-profile'),
      cleanupPrepared: jest.fn().mockResolvedValue(undefined),
      cleanupSession: jest.fn().mockResolvedValue(undefined),
    };

    const agent = fakeAgent({ id: AGENT_ID, projectId: PROJECT_ID, epicId: null });
    const project = fakeProject({ id: PROJECT_ID });
    const profile = fakeProfile();
    const provider = fakeProvider({ name: 'test-provider' });
    const config = fakeProfileProviderConfig();
    const storage = {
      getAgent: jest.fn().mockResolvedValue(agent),
      getProject: jest.fn().mockResolvedValue(project),
      getEpic: jest.fn().mockRejectedValue(new Error('no epic')),
      getAgentProfile: jest.fn().mockResolvedValue(profile),
      getProvider: jest.fn().mockResolvedValue(provider),
      getProviderEnvForProject: jest.fn().mockReturnValue(null),
      getInitialSessionPrompt: jest.fn().mockResolvedValue(null),
      listProfileProviderConfigsByProfile: jest.fn().mockResolvedValue([config]),
      listAgents: jest.fn().mockResolvedValue({ items: [agent], total: 1, limit: 100, offset: 0 }),
    };
    const adapter = {
      providerName: 'test-provider',
      buildLaunchArgs: jest
        .fn()
        .mockImplementation((input: { mode: 'new' | 'restore'; providerSessionId?: string }) => ({
          argv:
            input.mode === 'restore'
              ? ['--resume', input.providerSessionId!]
              : ['--session', 'new'],
        })),
    };
    const providerAdapterFactory = { getAdapter: jest.fn().mockReturnValue(adapter) };
    const hooksConfigService = { ensureHooksConfig: jest.fn().mockResolvedValue(undefined) };
    const copilotHooksConfigService = {
      providerName: 'copilot',
      ensureHooksConfig: jest.fn().mockResolvedValue(undefined),
    };
    const preflightService = {
      runChecks: jest.fn().mockResolvedValue({ overall: 'pass', checks: [], providers: [] }),
    };
    const mcpEnsureService = { ensureMcp: jest.fn().mockResolvedValue(undefined) };
    const teamsStore = { listTeamsByAgent: jest.fn().mockResolvedValue([]) };
    const streamService = {
      cancelScheduledClear: jest.fn().mockReturnValue(null),
      scheduleClear: jest.fn(),
    };
    const providerPluginPolicy = { resolveAll: jest.fn().mockResolvedValue([]) };

    const launchPipeline = new SessionLaunchPipeline(
      db,
      storage as never,
      coordinator,
      providerAdapterFactory as never,
      terminalIO as never,
      ptyService as never,
      terminalSessionRegistry as never,
      hooksConfigService as never,
      copilotHooksConfigService as never,
      preflightService as never,
      mcpEnsureService as never,
      eventsService as never,
      teamsStore as never,
      runtimeContextCapture as never,
      claudeLaunchSettings as never,
      codexPluginProfiles as never,
      providerPluginPolicy as never,
    );
    const restorePipeline = new SessionRestorePipeline(
      db,
      storage as never,
      coordinator,
      providerAdapterFactory as never,
      terminalIO as never,
      ptyService as never,
      terminalSessionRegistry as never,
      eventsService as never,
      streamService as never,
      runtimeContextCapture as never,
      claudeLaunchSettings as never,
      codexPluginProfiles as never,
      providerPluginPolicy as never,
    );
    sessionRuntime = new SessionRuntime(launchPipeline, restorePipeline);
    sessionsService = new SessionsService(
      db,
      storage as never,
      terminalIO as never,
      ptyService as never,
      preflightService as never,
      mcpEnsureService as never,
      coordinator,
      hooksConfigService as never,
      providerAdapterFactory as never,
      eventsService as never,
      terminalSessionRegistry as never,
      runtimeContextCapture as never,
      claudeLaunchSettings as never,
      codexPluginProfiles as never,
    );
    facade = new SessionLifecycleFacade(sessionRuntime, sessionsService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    sqlite.close();
  });

  function seedRestorableSession(): void {
    sqlite
      .prepare(
        `INSERT INTO sessions
          (id, agent_id, status, provider_session_id, provider_name_at_launch,
           started_at, ended_at, created_at, updated_at)
         VALUES (?, ?, 'stopped', ?, 'test-provider', ?, ?, ?, ?)`,
      )
      .run(RESTORE_SESSION_ID, AGENT_ID, 'provider-session-1', NOW, NOW, NOW, NOW);
  }

  function readRows(): Array<{ id: string; tmux_session_id: string; status: string }> {
    return sqlite
      .prepare(
        `SELECT id, tmux_session_id, status FROM sessions
         WHERE agent_id = ? ORDER BY started_at DESC, id DESC`,
      )
      .all(AGENT_ID) as Array<{ id: string; tmux_session_id: string; status: string }>;
  }

  it('keeps parallel active-session reads pure during a fresh launch publication window', async () => {
    const gate = deferred();
    createGate = gate;
    const launch = sessionRuntime.launch({ agentId: AGENT_ID, projectId: PROJECT_ID });
    await waitFor(() => terminalIO.createEmptySession.mock.calls.length === 1);
    const exactTmux = terminalIO.createEmptySession.mock.calls[0][0] as string;

    const reads = await Promise.all([
      sessionsService.listActiveSessions(),
      sessionsService.listActiveSessions(),
      sessionsService.listActiveSessions(),
    ]);

    for (const result of reads) {
      expect(result).toEqual([
        expect.objectContaining({ agentId: AGENT_ID, status: 'running', tmuxSessionId: exactTmux }),
      ]);
    }
    expect(terminalIO.sessionExists).not.toHaveBeenCalled();
    expect(ptyService.stopStreaming).not.toHaveBeenCalled();
    expect(terminalSessionRegistry.dispose).not.toHaveBeenCalled();
    expect(runtimeContextCapture.clear).not.toHaveBeenCalled();
    expect(claudeLaunchSettings.cleanupSessionSync).not.toHaveBeenCalled();
    expect(codexPluginProfiles.cleanupSession).not.toHaveBeenCalled();

    gate.resolve();
    const launched = await launch;
    expect(readRows()).toEqual([
      { id: launched.id, tmux_session_id: exactTmux, status: 'running' },
    ]);
    expect(liveTmux).toEqual(new Set([exactTmux]));
  });

  it('keeps active-session reads pure during restore and preserves the exact replacement tmux', async () => {
    seedRestorableSession();
    const gate = deferred();
    createGate = gate;
    const restore = sessionRuntime.restore(RESTORE_SESSION_ID, PROJECT_ID);
    await waitFor(() => terminalIO.createEmptySession.mock.calls.length === 1);
    const exactTmux = terminalIO.createEmptySession.mock.calls[0][0] as string;

    const reads = await Promise.all([
      sessionsService.listActiveSessions(),
      sessionsService.listActiveSessions(),
    ]);
    for (const result of reads) {
      expect(result).toEqual([
        expect.objectContaining({
          id: RESTORE_SESSION_ID,
          status: 'running',
          tmuxSessionId: exactTmux,
        }),
      ]);
    }
    expect(terminalIO.sessionExists).not.toHaveBeenCalled();
    expect(runtimeContextCapture.clear).not.toHaveBeenCalled();

    gate.resolve();
    await restore;
    expect(readRows()).toEqual([
      { id: RESTORE_SESSION_ID, tmux_session_id: exactTmux, status: 'running' },
    ]);
    expect(liveTmux).toEqual(new Set([exactTmux]));
  });

  it('queues termination behind launch and never publishes started after stopped', async () => {
    const gate = deferred();
    createGate = gate;
    const launch = sessionRuntime.launch({ agentId: AGENT_ID, projectId: PROJECT_ID });
    await waitFor(() => terminalIO.createEmptySession.mock.calls.length === 1);
    const exactTmux = terminalIO.createEmptySession.mock.calls[0][0] as string;
    const sessionId = readRows()[0].id;

    const terminate = sessionsService.terminateSession(sessionId, TEST_TERMINATION);
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(terminalIO.sessionExists).not.toHaveBeenCalled();
    expect(ptyService.stopStreaming).not.toHaveBeenCalled();
    expect(runtimeContextCapture.clear).not.toHaveBeenCalled();

    gate.resolve();
    await launch;
    await terminate;

    expect(terminalIO.destroyExpectedSession).toHaveBeenCalledWith(
      { name: exactTmux },
      { onUnknownError: 'rearm', sessionId },
    );
    expect(liveTmux).not.toContain(exactTmux);
    expect(readRows()).toEqual([{ id: sessionId, tmux_session_id: exactTmux, status: 'stopped' }]);
    const eventNames = eventsService.publish.mock.calls.map(([name]) => name);
    expect(eventNames.indexOf('session.started')).toBeLessThan(
      eventNames.indexOf('session.stopped'),
    );
  });

  it('queues every termination artifact cleanup behind a held restore lock', async () => {
    seedRestorableSession();
    const gate = deferred();
    createGate = gate;
    const restore = sessionRuntime.restore(RESTORE_SESSION_ID, PROJECT_ID);
    await waitFor(() => terminalIO.createEmptySession.mock.calls.length === 1);
    const exactTmux = terminalIO.createEmptySession.mock.calls[0][0] as string;

    const terminate = sessionsService.terminateSession(RESTORE_SESSION_ID, TEST_TERMINATION);
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(terminalIO.sessionExists).not.toHaveBeenCalled();
    expect(ptyService.stopStreaming).not.toHaveBeenCalled();
    expect(terminalSessionRegistry.dispose).not.toHaveBeenCalled();
    expect(runtimeContextCapture.clear).not.toHaveBeenCalled();
    expect(claudeLaunchSettings.cleanupSessionSync).not.toHaveBeenCalled();
    expect(codexPluginProfiles.cleanupSession).not.toHaveBeenCalled();

    gate.resolve();
    await restore;
    await terminate;

    expect(terminalIO.destroyExpectedSession).toHaveBeenCalledWith(
      { name: exactTmux },
      { onUnknownError: 'rearm', sessionId: RESTORE_SESSION_ID },
    );
    expect(readRows()).toEqual([
      { id: RESTORE_SESSION_ID, tmux_session_id: exactTmux, status: 'stopped' },
    ]);
  });

  it('uses sequential terminate and launch acquisitions for restart during launch', async () => {
    const gate = deferred();
    createGate = gate;
    const firstLaunch = sessionRuntime.launch({ agentId: AGENT_ID, projectId: PROJECT_ID });
    await waitFor(() => terminalIO.createEmptySession.mock.calls.length === 1);
    const oldTmux = terminalIO.createEmptySession.mock.calls[0][0] as string;
    const oldSessionId = readRows()[0].id;

    const restart = facade.restart(AGENT_ID, PROJECT_ID);
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(terminalIO.destroyExpectedSession).not.toHaveBeenCalled();

    gate.resolve();
    await firstLaunch;
    const replacement = await restart;
    const replacementTmux = terminalIO.createEmptySession.mock.calls[1][0] as string;

    expect(replacement.id).not.toBe(oldSessionId);
    expect(terminalIO.destroyExpectedSession).toHaveBeenCalledWith(
      { name: oldTmux },
      { onUnknownError: 'rearm', sessionId: oldSessionId },
    );
    expect(liveTmux.has(oldTmux)).toBe(false);
    expect(liveTmux).toEqual(new Set([replacementTmux]));
    expect(readRows()).toEqual(
      expect.arrayContaining([
        { id: replacement.id, tmux_session_id: replacementTmux, status: 'running' },
        { id: oldSessionId, tmux_session_id: oldTmux, status: 'stopped' },
      ]),
    );
  });

  it('keeps the durable row and runtime/provider artifacts intact on unknown destroy failure', async () => {
    sqlite
      .prepare(
        `INSERT INTO sessions
          (id, agent_id, tmux_session_id, status, provider_name_at_launch,
           started_at, created_at, updated_at)
         VALUES (?, ?, ?, 'running', 'test-provider', ?, ?, ?)`,
      )
      .run(RESTORE_SESSION_ID, AGENT_ID, 'tmux-unknown', NOW, NOW, NOW);
    liveTmux.add('tmux-unknown');
    terminalIO.destroyExpectedSession.mockResolvedValueOnce({
      outcome: 'unknown-error',
      error: new Error('unknown destroy failure'),
    });

    await expect(
      sessionsService.terminateSession(RESTORE_SESSION_ID, TEST_TERMINATION),
    ).rejects.toThrow('unknown destroy failure');

    expect(readRows()).toEqual([
      { id: RESTORE_SESSION_ID, tmux_session_id: 'tmux-unknown', status: 'running' },
    ]);
    expect(liveTmux).toEqual(new Set(['tmux-unknown']));
    expect(ptyService.stopStreaming).not.toHaveBeenCalled();
    expect(terminalSessionRegistry.dispose).not.toHaveBeenCalled();
    expect(runtimeContextCapture.clear).not.toHaveBeenCalled();
    expect(claudeLaunchSettings.cleanupSessionSync).not.toHaveBeenCalled();
    expect(codexPluginProfiles.cleanupSession).not.toHaveBeenCalled();
  });
});
