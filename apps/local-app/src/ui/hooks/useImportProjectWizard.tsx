import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import {
  fetchSetupPreview,
  fetchUpgradeSetupPreview,
  formatProjectPreMutationFailure,
  isProjectPreMutationFailure,
  type ImportDryRunResponse,
  type ImportDryRunSuccess,
  type ImportProjectResponse,
  type ImportProjectSuccess,
  type ProjectPreMutationFailure,
  type SetupPreviewRequest,
  type SetupPreviewResponse,
  type UpgradeProjectFailure,
  type UpgradeProjectResponse,
  type UpgradeProjectSuccess,
} from '@/ui/pages/projects/lib/project-api';
import {
  useProjectSetupWizard,
  type ProjectSetupWizardController,
  type WizardStep,
} from '@/ui/hooks/useProjectSetupWizard';
import {
  Step4Review,
  hasUnmappedStatuses,
  type ImportDryRunReview,
} from '@/ui/components/project/wizard/Step4Review';
import {
  buildConfigEmission,
  buildConfigSteps,
  initialWizardConfigState,
  useWizardConfigHandlers,
  type WizardConfigState,
} from '@/ui/components/project/wizard/useWizardConfig';
import { formatPromptTransferCounts, type PromptTransferCounts } from '@/common/prompt-transfer';
import { Alert, AlertDescription, AlertTitle } from '@/ui/components/ui/alert';

type ToastFn = (args: { title: string; description: string; variant?: 'destructive' }) => void;

export interface ImportWizardTarget {
  id: string;
  name: string;
}

export interface UpgradeWizardTarget extends ImportWizardTarget {
  targetVersion: string;
}

export type ImportDryRunResult = ImportDryRunSuccess;
export type ImportResult = ImportProjectSuccess;

interface ReplaceWizardState extends WizardConfigState {
  statusMappings: Record<string, string>;
}

interface ReplaceFlowAdapter<
  TTarget extends ImportWizardTarget,
  TSuccess extends { success: true },
> {
  name: 'Import' | 'Upgrade' | 'Update';
  previewQueryKey: (target: TTarget, request: SetupPreviewRequest | null) => QueryKey;
  canLoadPreview: (request: SetupPreviewRequest | null) => boolean;
  loadPreview: (
    target: TTarget,
    request: SetupPreviewRequest | null,
  ) => Promise<SetupPreviewResponse>;
  buildCommitBody: (
    target: TTarget,
    preview: SetupPreviewResponse,
    state: ReplaceWizardState,
  ) => Record<string, unknown>;
  commit: (
    target: TTarget,
    body: Record<string, unknown>,
  ) => Promise<TSuccess | ProjectPreMutationFailure | UpgradeProjectFailure>;
  isTerminalFailure: (failure: ProjectPreMutationFailure | UpgradeProjectFailure) => boolean;
  successDescription: (target: TTarget, result: TSuccess) => string;
  invalidateOnClose: QueryKey[];
  invalidateOnSuccess: QueryKey[];
}

interface ConfiguredReplaceWizardResult<TTarget extends ImportWizardTarget> {
  isOpen: boolean;
  openWizard: (target: TTarget, previewRequest?: SetupPreviewRequest) => void;
  onOpenChange: (open: boolean) => void;
  controller: ProjectSetupWizardController;
  isLoading: boolean;
  isError: boolean;
  isSubmitting: boolean;
  preview: SetupPreviewResponse | null;
  target: TTarget | null;
  preflightFailure: ProjectPreMutationFailure | null;
}

interface UseConfiguredReplaceWizardArgs<
  TTarget extends ImportWizardTarget,
  TSuccess extends { success: true },
> {
  adapter: ReplaceFlowAdapter<TTarget, TSuccess>;
  onCompleted: (result: TSuccess | UpgradeProjectFailure) => void;
  onClosed?: () => void;
  toast: ToastFn;
}

function toReview(dry: ImportDryRunResult | null): ImportDryRunReview | null {
  if (!dry) return null;
  return {
    counts: dry.counts,
    unmatchedStatuses: dry.unmatchedStatuses,
    templateStatuses: dry.templateStatuses,
    missingProviders: dry.missingProviders,
    promptTransfer: dry.promptTransfer,
  };
}

async function postJson<T>(url: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.message || error.error || `Request failed with status ${res.status}`);
  }
  return res.json();
}

function withStatusMappings(
  body: Record<string, unknown>,
  statusMappings: Record<string, string>,
): Record<string, unknown> {
  return Object.keys(statusMappings).length > 0 ? { ...body, statusMappings } : body;
}

function formatPromptSummary(promptTransfer?: PromptTransferCounts): string {
  return promptTransfer ? ` Prompts: ${formatPromptTransferCounts(promptTransfer)}.` : '';
}

function useConfiguredReplaceWizard<
  TTarget extends ImportWizardTarget,
  TSuccess extends { success: true },
>({
  adapter,
  onCompleted,
  onClosed,
  toast,
}: UseConfiguredReplaceWizardArgs<TTarget, TSuccess>): ConfiguredReplaceWizardResult<TTarget> {
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [target, setTarget] = useState<TTarget | null>(null);
  const [previewRequest, setPreviewRequest] = useState<SetupPreviewRequest | null>(null);
  const [state, setState] = useState<ReplaceWizardState | null>(null);
  const [dryRun, setDryRun] = useState<ImportDryRunResult | null>(null);
  const [preflightFailure, setPreflightFailure] = useState<ProjectPreMutationFailure | null>(null);
  const [isDryRunPending, setIsDryRunPending] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);

  const previewQuery = useQuery({
    queryKey: target
      ? adapter.previewQueryKey(target, previewRequest)
      : ['configured-replace-preview', adapter.name, 'closed'],
    queryFn: () => adapter.loadPreview(target!, previewRequest),
    enabled: isOpen && target !== null && adapter.canLoadPreview(previewRequest),
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const preview = previewQuery.data ?? null;

  useEffect(() => {
    if (isOpen && preview && state === null) {
      setState({ ...initialWizardConfigState(preview), statusMappings: {} });
    }
  }, [isOpen, preview, state]);

  const handlers = useWizardConfigHandlers(preview, setState);

  const onStatusMappingChange = useCallback((statusId: string, templateLabel: string) => {
    setState((previous) =>
      previous
        ? {
            ...previous,
            statusMappings: { ...previous.statusMappings, [statusId]: templateLabel },
          }
        : previous,
    );
  }, []);

  const review = useMemo(() => toReview(dryRun), [dryRun]);
  const reviewReady =
    !isDryRunPending &&
    dryRun !== null &&
    dryRun.readiness?.ready !== false &&
    preflightFailure === null &&
    !hasUnmappedStatuses(review, state?.statusMappings ?? {});

  const invalidate = useCallback(
    (queryKeys: QueryKey[]) => {
      for (const queryKey of queryKeys) {
        void queryClient.invalidateQueries({ queryKey });
      }
    },
    [queryClient],
  );

  const closeWizard = useCallback(() => {
    setIsOpen(false);
    invalidate(adapter.invalidateOnClose);
    onClosed?.();
  }, [adapter, invalidate, onClosed]);

  const dryRunBody = useCallback(() => {
    if (!preview || !state) return null;
    return withStatusMappings(
      {
        ...(preview.payload as Record<string, unknown>),
        ...buildConfigEmission(preview, state),
      },
      state.statusMappings,
    );
  }, [preview, state]);

  const runDryRun = useCallback(async () => {
    const body = dryRunBody();
    if (!target || !body) return;
    setIsDryRunPending(true);
    setPreflightFailure(null);
    try {
      const result = await postJson<ImportDryRunResponse>(
        `/api/projects/${encodeURIComponent(target.id)}/import?dryRun=true`,
        body,
      );
      if (result.dryRun !== true || !result.counts) {
        throw new Error('Precheck returned an invalid result');
      }
      setDryRun(result);
      if (isProjectPreMutationFailure(result)) {
        setPreflightFailure(result);
        toast({
          title: `${adapter.name} precheck failed`,
          description: formatProjectPreMutationFailure(result),
          variant: 'destructive',
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to compute changes';
      setPreflightFailure({
        success: false,
        mutationStarted: false,
        error: message,
      });
      toast({
        title: `${adapter.name} precheck failed`,
        description: message,
        variant: 'destructive',
      });
    } finally {
      setIsDryRunPending(false);
    }
  }, [adapter.name, dryRunBody, target, toast]);

  const submit = useCallback(async () => {
    if (!target || !preview || !state) return;
    const body = adapter.buildCommitBody(target, preview, state);
    setIsCommitting(true);
    try {
      const result = await adapter.commit(target, body);
      if (result.success === true) {
        setIsOpen(false);
        invalidate(adapter.invalidateOnSuccess);
        toast({
          title: `${adapter.name} complete`,
          description: adapter.successDescription(target, result),
        });
        onCompleted(result);
        return;
      }

      if (result.mutationStarted === false) {
        const failure: ProjectPreMutationFailure = {
          ...result,
          mutationStarted: false,
          error: result.error || `${adapter.name} could not start`,
        };
        setPreflightFailure(failure);
        toast({
          title: `${adapter.name} failed`,
          description: formatProjectPreMutationFailure(failure),
          variant: 'destructive',
        });
        return;
      }

      if (adapter.isTerminalFailure(result)) {
        setIsOpen(false);
        invalidate(adapter.invalidateOnSuccess);
        onCompleted(result);
        return;
      }
      throw new Error(result.error || `${adapter.name} returned an invalid failure result`);
    } catch (error) {
      toast({
        title: `${adapter.name} failed`,
        description: error instanceof Error ? error.message : `${adapter.name} failed`,
        variant: 'destructive',
      });
    } finally {
      setIsCommitting(false);
    }
  }, [adapter, invalidate, onCompleted, preview, state, target, toast]);

  const reviewStep = useMemo<WizardStep>(
    () => ({
      id: 'review',
      title: 'Review',
      canProceed: reviewReady,
      render: () =>
        state ? (
          <Fragment>
            {preflightFailure && (
              <Alert variant="destructive" role="alert" className="mb-3">
                <AlertTitle>{adapter.name} blocked before making changes</AlertTitle>
                <AlertDescription>
                  {formatProjectPreMutationFailure(preflightFailure)}
                </AlertDescription>
              </Alert>
            )}
            {(review || !preflightFailure) && (
              <Step4Review
                review={review}
                isLoading={isDryRunPending || (dryRun === null && isOpen)}
                statusMappings={state.statusMappings}
                onStatusMappingChange={onStatusMappingChange}
                operationName={adapter.name.toLowerCase()}
              />
            )}
          </Fragment>
        ) : null,
    }),
    [
      adapter.name,
      dryRun,
      isDryRunPending,
      isOpen,
      onStatusMappingChange,
      preflightFailure,
      review,
      reviewReady,
      state,
    ],
  );

  const steps = useMemo<WizardStep[]>(
    () => [...buildConfigSteps({ preview, state, handlers }).steps, reviewStep],
    [handlers, preview, reviewStep, state],
  );

  const controller = useProjectSetupWizard({ steps, onSubmit: submit, onCancel: closeWizard });
  const { currentStep, reset } = controller;
  const currentStepId = currentStep?.id;

  useEffect(() => {
    if (!isOpen) return;
    if (currentStepId === 'review') {
      if (dryRun === null && preflightFailure === null && !isDryRunPending) void runDryRun();
    } else if (dryRun !== null || preflightFailure !== null) {
      setDryRun(null);
      setPreflightFailure(null);
    }
  }, [currentStepId, dryRun, isDryRunPending, isOpen, preflightFailure, runDryRun]);

  const openWizard = useCallback(
    (nextTarget: TTarget, request?: SetupPreviewRequest) => {
      setTarget(nextTarget);
      setPreviewRequest(request ?? null);
      setState(null);
      setDryRun(null);
      setPreflightFailure(null);
      setIsDryRunPending(false);
      reset();
      setIsOpen(true);
    },
    [reset],
  );

  const onOpenChange = useCallback(
    (open: boolean) => {
      if (!open) closeWizard();
    },
    [closeWizard],
  );

  const isError = previewQuery.isError;
  const isLoading = isOpen && !isError && (previewQuery.isLoading || state === null);

  return {
    isOpen,
    openWizard,
    onOpenChange,
    controller,
    isLoading,
    isError,
    isSubmitting: isCommitting,
    preview,
    target,
    preflightFailure,
  };
}

const importAdapter: ReplaceFlowAdapter<ImportWizardTarget, ImportProjectSuccess> = {
  name: 'Import',
  previewQueryKey: (_target, request) => ['setup-preview', request],
  canLoadPreview: (request) => request !== null,
  loadPreview: (_target, request) => fetchSetupPreview(request!),
  buildCommitBody: (_target, preview, state) =>
    withStatusMappings(
      {
        ...(preview.payload as Record<string, unknown>),
        ...buildConfigEmission(preview, state),
      },
      state.statusMappings,
    ),
  commit: (target, body) =>
    postJson<ImportProjectResponse>(`/api/projects/${encodeURIComponent(target.id)}/import`, body),
  isTerminalFailure: () => false,
  successDescription: (_target, result) => {
    return `${result.message || 'Project replaced.'}${formatPromptSummary(result.promptTransfer)}`;
  },
  invalidateOnClose: [],
  invalidateOnSuccess: [['projects']],
};

function upgradeAdapter(
  actionName: 'Upgrade' | 'Update',
): ReplaceFlowAdapter<UpgradeWizardTarget, UpgradeProjectSuccess> {
  return {
    name: actionName,
    previewQueryKey: (target) => ['upgrade-template-preview', target.id, target.targetVersion],
    canLoadPreview: () => true,
    loadPreview: (target) => fetchUpgradeSetupPreview(target.id, target.targetVersion),
    buildCommitBody: (target, preview, state) =>
      withStatusMappings(
        {
          targetVersion: target.targetVersion,
          ...buildConfigEmission(preview, state),
        },
        state.statusMappings,
      ),
    commit: (target, body) =>
      postJson<UpgradeProjectResponse>(
        `/api/projects/${encodeURIComponent(target.id)}/upgrade-template`,
        body,
      ),
    isTerminalFailure: (failure) => failure.mutationStarted !== false,
    successDescription: (target, result) => {
      return `${target.name} ${actionName === 'Upgrade' ? 'upgraded' : 'updated'} to v${result.newVersion}.${formatPromptSummary(result.promptTransfer)}`;
    },
    invalidateOnClose: [['projects'], ['templates-for-upgrade']],
    invalidateOnSuccess: [['projects'], ['templates-for-upgrade']],
  };
}

interface UseImportProjectWizardArgs {
  onImported: (result: ImportResult) => void;
  toast: ToastFn;
}

export interface ImportProjectWizardResult
  extends Omit<ConfiguredReplaceWizardResult<ImportWizardTarget>, 'openWizard' | 'target'> {
  openImportWizard: (target: ImportWizardTarget, previewRequest: SetupPreviewRequest) => void;
  importTarget: ImportWizardTarget | null;
}

export function useImportProjectWizard({
  onImported,
  toast,
}: UseImportProjectWizardArgs): ImportProjectWizardResult {
  const wizard = useConfiguredReplaceWizard({
    adapter: importAdapter,
    onCompleted: (result) => {
      if (result.success) onImported(result);
    },
    toast,
  });
  return {
    ...wizard,
    openImportWizard: wizard.openWizard,
    importTarget: wizard.target,
  };
}

interface UseUpgradeProjectWizardArgs {
  actionName: 'Upgrade' | 'Update';
  onFinished: (result: UpgradeProjectResponse) => void;
  onClosed: () => void;
  toast: ToastFn;
}

export interface UpgradeProjectWizardResult
  extends Omit<ConfiguredReplaceWizardResult<UpgradeWizardTarget>, 'openWizard' | 'target'> {
  openUpgradeWizard: (target: UpgradeWizardTarget) => void;
  upgradeTarget: UpgradeWizardTarget | null;
}

export function useUpgradeProjectWizard({
  actionName,
  onFinished,
  onClosed,
  toast,
}: UseUpgradeProjectWizardArgs): UpgradeProjectWizardResult {
  const adapter = useMemo(() => upgradeAdapter(actionName), [actionName]);
  const wizard = useConfiguredReplaceWizard({ adapter, onCompleted: onFinished, onClosed, toast });
  return {
    ...wizard,
    openUpgradeWizard: wizard.openWizard,
    upgradeTarget: wizard.target,
  };
}
