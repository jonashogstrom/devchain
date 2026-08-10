import { useEffect, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { useImportProjectWizard, useUpgradeProjectWizard } from './useImportProjectWizard';
import type { SetupPreviewResponse } from '@/ui/pages/projects/lib/project-api';

(global as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
Element.prototype.scrollIntoView = jest.fn();

function preview(over: Partial<SetupPreviewResponse['payload']> = {}): SetupPreviewResponse {
  return {
    payload: {
      agents: [],
      profiles: [],
      teams: [],
      presets: [],
      providerModels: [],
      providerEfforts: [],
      ...over,
    } as unknown as SetupPreviewResponse['payload'],
    providerSummary: [],
    familyAlternatives: [],
    presetProviderCoverage: [],
    localAvailability: { installedProviders: [] },
  };
}

function configuredPreview(): SetupPreviewResponse {
  return {
    payload: {
      description: 'target-only marker',
      profiles: [
        {
          id: 'profile-1',
          name: 'Coder',
          provider: { name: 'claude' },
          providerConfigs: [{ name: 'claude-config', providerName: 'claude', env: {} }],
        },
      ],
      agents: [{ name: 'Captain', profileId: 'profile-1', providerConfigName: 'claude-config' }],
      teams: [
        {
          name: 'Target Team',
          teamLeadAgentName: 'Captain',
          memberAgentNames: [],
          allowTeamLeadCreateAgents: true,
          profileNames: ['Coder'],
        },
      ],
      presets: [
        {
          name: 'Target Default',
          agentConfigs: [{ agentName: 'Captain', providerConfigName: 'claude-config' }],
        },
      ],
    } as unknown as SetupPreviewResponse['payload'],
    providerSummary: [{ name: 'claude', available: true, families: [], agentCount: 1 }],
    familyAlternatives: [],
    presetProviderCoverage: [
      {
        presetName: 'Target Default',
        referencedProviders: ['claude'],
        coversAllAgents: true,
        coveredAgentNames: ['Captain'],
        agentResolvedProviders: { Captain: 'claude' },
      },
    ],
    localAvailability: { installedProviders: [{ id: 'provider-1', name: 'claude' }] },
  };
}

interface FetchLog {
  setupPreview: number;
  dryRun: number;
  commit: number;
  lastCommitBody: unknown;
  lastDryRunBody: unknown;
}

function mockFetch(opts: {
  previewResponse?: SetupPreviewResponse;
  dryRunResponse?: unknown;
  commitResponse?: unknown;
}): FetchLog {
  const log: FetchLog = {
    setupPreview: 0,
    dryRun: 0,
    commit: 0,
    lastCommitBody: null,
    lastDryRunBody: null,
  };
  global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    if (url === '/api/projects/setup-preview') {
      log.setupPreview += 1;
      return { ok: true, json: async () => opts.previewResponse ?? preview() };
    }
    if (url.includes('/import?dryRun=true')) {
      log.dryRun += 1;
      log.lastDryRunBody = body;
      return {
        ok: true,
        json: async () =>
          opts.dryRunResponse ?? {
            dryRun: true,
            missingProviders: [],
            counts: { toImport: { agents: 1 }, toDelete: {} },
          },
      };
    }
    // Commit (no query string).
    log.commit += 1;
    log.lastCommitBody = body;
    return {
      ok: true,
      json: async () =>
        opts.commitResponse ?? {
          success: true,
          counts: { imported: {}, deleted: {} },
          mappings: {},
        },
    };
  }) as unknown as typeof fetch;
  return log;
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const TARGET = { id: 'proj-1', name: 'My Project' };
const PROMPT_PREFLIGHT_FAILURE = {
  success: false,
  mutationStarted: false,
  error: 'Template profiles reference excluded prompts',
  promptReferenceValidation: {
    code: 'skipped_prompt_references',
    promptTitles: ['Private SOP'],
    issues: [{ promptTitle: 'Private SOP', profileNames: ['Coder'] }],
  },
} as const;

describe('useImportProjectWizard', () => {
  it('loads the setup-preview, runs the dry-run on Review, and commits on submit', async () => {
    const log = mockFetch({});
    const onImported = jest.fn();
    const { result } = renderHook(() => useImportProjectWizard({ onImported, toast: jest.fn() }), {
      wrapper,
    });

    act(() => result.current.openImportWizard(TARGET, { slug: 'demo' }));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(log.setupPreview).toBe(1);

    // Providers → Agents (Teams skipped: no configurable team) → Review.
    act(() => result.current.controller.goNext());
    act(() => result.current.controller.goNext());
    await waitFor(() => expect(result.current.controller.currentStep?.id).toBe('review'));

    // Dry-run fires on entering Review; the final step then becomes proceedable.
    await waitFor(() => expect(log.dryRun).toBe(1));
    await waitFor(() => expect(result.current.controller.canProceed).toBe(true));
    expect(result.current.controller.isLastStep).toBe(true);

    // Submit → destructive commit → onImported + wizard closes.
    await act(async () => {
      result.current.controller.submit();
    });
    await waitFor(() => expect(log.commit).toBe(1));
    expect(onImported).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    await waitFor(() => expect(result.current.isOpen).toBe(false));
  });

  it('blocks the final Import until every unmatched status is mapped', async () => {
    mockFetch({
      dryRunResponse: {
        dryRun: true,
        missingProviders: [],
        counts: { toImport: {}, toDelete: {} },
        unmatchedStatuses: [{ id: 's1', label: 'Backlog', color: '#111', epicCount: 2 }],
        templateStatuses: [{ label: 'Todo', color: '#222' }],
      },
    });
    const { result } = renderHook(
      () => useImportProjectWizard({ onImported: jest.fn(), toast: jest.fn() }),
      { wrapper },
    );

    act(() => result.current.openImportWizard(TARGET, { slug: 'demo' }));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    act(() => result.current.controller.goNext());
    act(() => result.current.controller.goNext());
    await waitFor(() => expect(result.current.controller.currentStep?.id).toBe('review'));

    // Dry-run reports an unmatched status → Import is gated closed until it is mapped.
    await waitFor(() => expect(result.current.controller.canProceed).toBe(false));
  });

  it('keeps dry-run failures out of the counts review and displays their details', async () => {
    const log = mockFetch({
      dryRunResponse: {
        ...PROMPT_PREFLIGHT_FAILURE,
        dryRun: true,
        readiness: {
          ready: false,
          issues: [
            {
              code: 'prompt_reference_validation',
              message: PROMPT_PREFLIGHT_FAILURE.error,
              details: PROMPT_PREFLIGHT_FAILURE.promptReferenceValidation,
            },
          ],
        },
        missingProviders: [],
        counts: { toImport: { agents: 1 }, toDelete: { statuses: 0 } },
      },
    });
    const toast = jest.fn();
    let wizard: ReturnType<typeof useImportProjectWizard> | null = null;

    function Harness() {
      const hook = useImportProjectWizard({ onImported: jest.fn(), toast });
      wizard = hook;
      useEffect(() => hook.openImportWizard(TARGET, { slug: 'demo' }), []);
      return <>{hook.controller.currentStep?.render()}</>;
    }

    render(<Harness />, { wrapper });
    await waitFor(() => expect(wizard?.isLoading).toBe(false));
    act(() => wizard!.controller.goNext());
    act(() => wizard!.controller.goNext());

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Import blocked before making changes',
    );
    expect(screen.getByRole('alert')).toHaveTextContent('"Private SOP" (profiles: Coder)');
    expect(screen.getByTestId('wizard-review-import-counts')).toHaveTextContent('agents1');
    expect(log.dryRun).toBe(1);
    expect(wizard!.controller.canProceed).toBe(false);
    expect(wizard!.isOpen).toBe(true);
  });

  it('keeps the wizard open and skips completion when commit returns a structured failure', async () => {
    const log = mockFetch({ commitResponse: PROMPT_PREFLIGHT_FAILURE });
    const onImported = jest.fn();
    const toast = jest.fn();
    const { result } = renderHook(() => useImportProjectWizard({ onImported, toast }), {
      wrapper,
    });

    act(() => result.current.openImportWizard(TARGET, { slug: 'demo' }));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    act(() => result.current.controller.goNext());
    act(() => result.current.controller.goNext());
    await waitFor(() => expect(result.current.controller.canProceed).toBe(true));

    await act(async () => result.current.controller.submit());
    await waitFor(() => expect(log.commit).toBe(1));

    expect(result.current.isOpen).toBe(true);
    expect(result.current.preflightFailure).toEqual(PROMPT_PREFLIGHT_FAILURE);
    expect(onImported).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Import failed',
        description: expect.stringContaining('"Private SOP" (profiles: Coder)'),
        variant: 'destructive',
      }),
    );
    expect(toast).not.toHaveBeenCalledWith(expect.objectContaining({ title: 'Import complete' }));
  });

  it('includes selectedProviderNames + status mappings in the request bodies', async () => {
    const log = mockFetch({
      previewResponse: preview({
        // one available provider so the selection is non-empty
      }),
    });
    // Re-mock preview with an available provider summary.
    const previewWithProvider: SetupPreviewResponse = {
      ...preview(),
      providerSummary: [{ name: 'claude', available: true, families: [], agentCount: 0 }],
    };
    (global.fetch as jest.Mock).mockImplementation(async (url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      if (url === '/api/projects/setup-preview') {
        return { ok: true, json: async () => previewWithProvider };
      }
      if (url.includes('/import?dryRun=true')) {
        log.dryRun += 1;
        log.lastDryRunBody = body;
        return {
          ok: true,
          json: async () => ({
            dryRun: true,
            missingProviders: [],
            counts: { toImport: {}, toDelete: { statuses: 1 } },
            unmatchedStatuses: [{ id: 'status-1', label: 'Backlog', color: '#111', epicCount: 2 }],
            templateStatuses: [{ label: 'Todo', color: '#222' }],
          }),
        };
      }
      log.commit += 1;
      log.lastCommitBody = body;
      return {
        ok: true,
        json: async () => ({ success: true, counts: { imported: {}, deleted: {} }, mappings: {} }),
      };
    });

    // Render the Providers step body so the (no longer preselected) provider can be clicked;
    // later steps are driven purely through the captured controller.
    let wiz: ReturnType<typeof useImportProjectWizard> | null = null;
    function Harness() {
      const hook = useImportProjectWizard({ onImported: jest.fn(), toast: jest.fn() });
      wiz = hook;
      useEffect(() => {
        hook.openImportWizard(TARGET, { slug: 'demo' });
      }, []);
      return <div>{hook.controller.currentStep?.render()}</div>;
    }
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <Harness />
      </QueryClientProvider>,
    );

    await screen.findByRole('checkbox', { name: 'Claude provider' });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Claude provider' }));
    await waitFor(() => expect(wiz!.controller.canProceed).toBe(true));

    act(() => wiz!.controller.goNext());
    act(() => wiz!.controller.goNext());
    await waitFor(() => expect(wiz!.controller.currentStep?.id).toBe('review'));
    await waitFor(() => expect(log.dryRun).toBeGreaterThanOrEqual(1));
    fireEvent.click(await screen.findByTestId('wizard-status-map-status-1'));
    fireEvent.click(await screen.findByRole('option', { name: /Todo/ }));
    await waitFor(() => expect(wiz!.controller.canProceed).toBe(true));

    await act(async () => {
      wiz!.controller.submit();
    });
    await waitFor(() => expect(log.commit).toBe(1));
    expect(
      (log.lastCommitBody as { selectedProviderNames?: string[] }).selectedProviderNames,
    ).toEqual(['claude']);
    expect(
      (log.lastCommitBody as { statusMappings?: Record<string, string> }).statusMappings,
    ).toEqual({ 'status-1': 'Todo' });
  });
});

describe('useUpgradeProjectWizard', () => {
  it('uses target preview, replace dry-run, and source-aligned configured commit adapters', async () => {
    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
    global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
      const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
      calls.push({ url, body });
      if (url.endsWith('/upgrade-template/preview')) {
        return {
          ok: true,
          json: async () => configuredPreview(),
        };
      }
      if (url.endsWith('/import?dryRun=true')) {
        return {
          ok: true,
          json: async () => ({
            dryRun: true,
            readiness: { ready: true, issues: [] },
            missingProviders: [],
            counts: { toImport: { agents: 0 }, toDelete: { statuses: 0 } },
          }),
        };
      }
      return { ok: true, json: async () => ({ success: true, newVersion: '2.0.0' }) };
    }) as unknown as typeof fetch;
    const onFinished = jest.fn();
    const onClosed = jest.fn();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
    const upgradeWrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(
      () =>
        useUpgradeProjectWizard({
          actionName: 'Upgrade',
          onFinished,
          onClosed,
          toast: jest.fn(),
        }),
      { wrapper: upgradeWrapper },
    );

    act(() =>
      result.current.openUpgradeWizard({
        id: 'proj-1',
        name: 'My Project',
        targetVersion: '2.0.0',
      }),
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(calls[0]).toEqual({
      url: '/api/projects/proj-1/upgrade-template/preview',
      body: { targetVersion: '2.0.0' },
    });

    act(() => result.current.controller.goNext());
    act(() => result.current.controller.goNext());
    act(() => result.current.controller.goNext());
    await waitFor(() => expect(result.current.controller.currentStep?.id).toBe('review'));
    await waitFor(() => expect(result.current.controller.canProceed).toBe(true));
    const dryRunCall = calls.find((call) => call.url.endsWith('/import?dryRun=true'))!;
    expect(dryRunCall.body).toEqual(expect.objectContaining({ description: 'target-only marker' }));

    await act(async () => result.current.controller.submit());
    await waitFor(() =>
      expect(onFinished).toHaveBeenCalledWith({ success: true, newVersion: '2.0.0' }),
    );
    const commitCall = calls.find((call) => call.url === '/api/projects/proj-1/upgrade-template')!;
    expect(commitCall.body).toEqual(
      expect.objectContaining({
        targetVersion: '2.0.0',
        selectedProviderNames: ['claude'],
        presetName: 'Target Default',
        teamOverrides: [
          expect.objectContaining({ teamName: 'Target Team', allowTeamLeadCreateAgents: true }),
        ],
      }),
    );
    expect(commitCall.body).not.toHaveProperty('agentOverrides');
    expect(commitCall.body).not.toHaveProperty('description');
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['projects'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['templates-for-upgrade'] });
  });

  it('shows readiness issues with counts and blocks final confirmation', async () => {
    global.fetch = jest.fn(async (url: string) => {
      if (url.endsWith('/upgrade-template/preview')) {
        return { ok: true, json: async () => preview() };
      }
      return {
        ok: true,
        json: async () => ({
          dryRun: true,
          success: false,
          mutationStarted: false,
          error: 'Active sessions block replacement',
          readiness: {
            ready: false,
            issues: [
              {
                code: 'active_sessions',
                message: 'Stop active sessions before replacing this project.',
                details: { activeSessions: [{ id: 'session-1', agentId: null }] },
              },
            ],
          },
          missingProviders: [],
          counts: { toImport: { agents: 2 }, toDelete: { statuses: 1 } },
        }),
      };
    }) as unknown as typeof fetch;
    let wizard: ReturnType<typeof useUpgradeProjectWizard> | null = null;
    function Harness() {
      const hook = useUpgradeProjectWizard({
        actionName: 'Upgrade',
        onFinished: jest.fn(),
        onClosed: jest.fn(),
        toast: jest.fn(),
      });
      wizard = hook;
      useEffect(() => {
        hook.openUpgradeWizard({ id: 'proj-1', name: 'My Project', targetVersion: '2.0.0' });
      }, []);
      return <>{hook.controller.currentStep?.render()}</>;
    }
    render(<Harness />, { wrapper });
    await waitFor(() => expect(wizard?.isLoading).toBe(false));
    act(() => wizard!.controller.goNext());
    act(() => wizard!.controller.goNext());

    expect(await screen.findByRole('alert')).toHaveTextContent(/Stop active sessions/);
    expect(screen.getByTestId('wizard-review-import-counts')).toHaveTextContent('agents2');
    expect(wizard!.controller.canProceed).toBe(false);
  });

  it('invalidates upgrade discovery queries when canceled', async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => preview(),
    })) as unknown as typeof fetch;
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
    const onClosed = jest.fn();
    const upgradeWrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(
      () =>
        useUpgradeProjectWizard({
          actionName: 'Upgrade',
          onFinished: jest.fn(),
          onClosed,
          toast: jest.fn(),
        }),
      { wrapper: upgradeWrapper },
    );

    act(() =>
      result.current.openUpgradeWizard({
        id: 'proj-1',
        name: 'My Project',
        targetVersion: '2.0.0',
      }),
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    act(() => result.current.controller.cancel());

    expect(onClosed).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['projects'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['templates-for-upgrade'] });
  });
});
