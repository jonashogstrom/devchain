import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { HostResolver } from '@devchain/shared';
import { getEnvConfig } from '../../../../common/config/env.config';
import { ConflictError, ValidationError } from '../../../../common/errors/error-types';
import { isHookCapable } from '../../../providers/adapters/capabilities';
import { ProviderPluginPolicyService } from '../../../providers/services/provider-plugin-policy.service';
import {
  ClaudeLaunchSettingsMaterializerService,
  type PreparedClaudeLaunchSettings,
} from '../../../runtime-context-capture/claude-launch-settings-materializer.service';
import { CONTEXT_WINDOW_ENV_KEY } from '../../../runtime-context-capture/context-window-policy';
import {
  CodexPluginProfileMaterializerService,
  type PreparedCodexPluginProfile,
} from '../../../runtime-context-capture/codex-plugin-profile-materializer.service';
import { RuntimeContextCaptureService } from '../../../runtime-context-capture/runtime-context-capture.service';
import type { RuntimeContextCaptureSnapshot } from '../../../runtime-context-capture/runtime-context-capture.types';
import {
  STORAGE_SERVICE,
  type StorageService,
} from '../../../storage/interfaces/storage.interface';
import { buildSessionCommand } from '../../utils/env-builder';
import {
  extractModelFromArgs,
  hasCodexProfileSelector,
  hasFlagOccurrence,
  parseProfileOptions,
} from '../../utils/profile-options';
import {
  resolve as resolveLaunchConfig,
  type LaunchConfig,
  type LaunchConfigInput,
} from '../provider-launch-config';
import type {
  PreparedProviderRuntime,
  ProviderRuntimePlanInput,
} from './provider-runtime-preparation.types';
import { ProviderRuntimePlan } from './provider-runtime-preparation.types';

const NOOP_AFTER_COMMAND = async (): Promise<void> => undefined;

interface ProviderRuntimePlanState {
  readonly mode: ProviderRuntimePlanInput['mode'];
  readonly provider: ProviderRuntimePlanInput['provider'];
  readonly providerName: string;
  readonly projectId: string;
  readonly projectName: string;
  readonly projectRootPath: string;
  readonly sessionId: string;
  readonly providerSessionId: string | null;
  readonly profileOptionArgs: readonly string[];
  readonly pluginPolicy: ReadonlyArray<{
    readonly pluginId: string;
    readonly enabled: boolean;
  }>;
  readonly baseInput: Readonly<LaunchConfigInput>;
  readonly baseConfig: LaunchConfig;
}

class ProviderRuntimePlanValue extends ProviderRuntimePlan {
  constructor(readonly state: ProviderRuntimePlanState) {
    super();
    Object.freeze(this);
  }
}

interface RollbackState {
  readonly mode: ProviderRuntimePlanInput['mode'];
  readonly sessionId: string;
  readonly priorCapture: RuntimeContextCaptureSnapshot | null;
  readonly captureStarted: boolean;
  readonly claudePrepared: boolean;
  readonly preparedCodex: PreparedCodexPluginProfile | null;
}

@Injectable()
export class ProviderRuntimePreparationService {
  constructor(
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
    private readonly providerPluginPolicy: ProviderPluginPolicyService,
    private readonly runtimeContextCapture: RuntimeContextCaptureService,
    private readonly claudeLaunchSettings: ClaudeLaunchSettingsMaterializerService,
    private readonly codexPluginProfiles: CodexPluginProfileMaterializerService,
  ) {}

  async createPlan(input: ProviderRuntimePlanInput): Promise<ProviderRuntimePlan> {
    const profileOptionArgs = Object.freeze(parseProfileOptions(input.profileOptions));
    const effectiveModel =
      input.agentModelOverride ?? input.configModel ?? extractModelFromArgs([...profileOptionArgs]);
    const effectiveEffort = input.agentEffortOverride ?? input.configEffort ?? null;
    const providerEnv = this.storage.getProviderEnvForProject(input.provider.id, input.projectId);
    const pluginPolicy = await this.providerPluginPolicy.resolveAll(
      input.projectId,
      input.provider.id,
    );
    const providerName = input.provider.name.toLowerCase();
    const frozenProvider = Object.freeze({
      ...input.provider,
      env: input.provider.env ? Object.freeze({ ...input.provider.env }) : null,
    });

    this.assertNoPolicyConflict(providerName, [...profileOptionArgs], pluginPolicy.length > 0);

    const environment = getEnvConfig();
    const baseInput: Readonly<LaunchConfigInput> = Object.freeze({
      mode: input.mode,
      ...(input.mode === 'new'
        ? { sessionId: input.sessionId, initialPrompt: input.initialPrompt }
        : { providerSessionId: input.providerSessionId }),
      adapter: input.adapter,
      profileOptions: input.profileOptions,
      modelOverride: effectiveModel,
      effortOverride: effectiveEffort,
      providerBinPath: input.providerBinPath,
      providerEnv: providerEnv ? Object.freeze({ ...providerEnv }) : null,
      configEnv: input.configEnv ? Object.freeze({ ...input.configEnv }) : null,
      provider: frozenProvider,
      hookContext: isHookCapable(input.adapter)
        ? Object.freeze({
            apiUrl: HostResolver.buildInternalBaseUrl({
              host: environment.HOST,
              port: environment.PORT,
            }),
            projectId: input.projectId,
            agentId: input.agentId,
            sessionId: input.sessionId,
            tmuxSessionName: input.tmuxSessionName,
          })
        : undefined,
    });
    const baseConfig = this.freezeConfig(resolveLaunchConfig(baseInput));

    if (input.mode === 'restore') {
      this.assertRestoreIdentity(baseConfig, input.provider.name, input.providerSessionId);
    }

    return new ProviderRuntimePlanValue(
      Object.freeze({
        mode: input.mode,
        provider: frozenProvider,
        providerName,
        projectId: input.projectId,
        projectName: input.projectName,
        projectRootPath: input.projectRootPath,
        sessionId: input.sessionId,
        providerSessionId: input.mode === 'restore' ? input.providerSessionId : null,
        profileOptionArgs,
        pluginPolicy: Object.freeze(
          pluginPolicy.map(({ pluginId, enabled }) => Object.freeze({ pluginId, enabled })),
        ),
        baseInput,
        baseConfig,
      } satisfies ProviderRuntimePlanState),
    );
  }

  async materialize(plan: ProviderRuntimePlan): Promise<PreparedProviderRuntime> {
    if (!(plan instanceof ProviderRuntimePlanValue)) {
      throw new ValidationError('Provider runtime plan was not created by this service.');
    }
    const state = plan.state;
    const priorCapture =
      state.mode === 'restore' ? this.runtimeContextCapture.snapshot(state.sessionId) : null;
    let captureStarted = false;
    let claudePrepared = false;
    let preparedCodex: PreparedCodexPluginProfile | null = null;

    try {
      const epoch = this.runtimeContextCapture.rotateEpoch(
        state.sessionId,
        state.baseConfig.contextWindowOverride ?? null,
      );
      captureStarted = true;

      const preparedSettings = await this.claudeLaunchSettings.prepare({
        providerName: state.providerName,
        settingsJson: state.provider.claudeLaunchSettingsJson,
        profileOptionArgs: [...state.profileOptionArgs],
        providerEnv: state.baseInput.providerEnv,
        configEnv: state.baseInput.configEnv,
        sessionId: state.sessionId,
        epoch,
        projectRootPath: state.projectRootPath,
        pluginPolicy: state.providerName === 'claude' ? state.pluginPolicy : [],
        policyRequired: state.providerName === 'claude' && state.pluginPolicy.length > 0,
      });
      claudePrepared = true;

      preparedCodex =
        state.providerName === 'codex'
          ? await this.codexPluginProfiles.prepare({
              projectId: state.projectId,
              projectName: state.projectName,
              sessionId: state.sessionId,
              pluginPolicy: state.pluginPolicy,
              attemptNonce: randomUUID(),
            })
          : null;

      const config = this.applyManagedOverlay(state, preparedSettings, preparedCodex);
      if (
        state.mode === 'restore' &&
        preparedSettings.optionArgs.length + (preparedCodex?.providerOptionArgs.length ?? 0) > 0
      ) {
        this.assertRestoreIdentity(
          config,
          state.providerName,
          this.restoreProviderSessionId(state),
        );
      }

      const finalConfig = this.freezeConfig(
        preparedCodex ? this.wrapCodexCommand(state, config, preparedCodex) : config,
      );
      const acknowledgement = preparedCodex;
      const rollbackState = (): RollbackState => ({
        mode: state.mode,
        sessionId: state.sessionId,
        priorCapture,
        captureStarted,
        claudePrepared,
        preparedCodex,
      });

      return Object.freeze({
        config: finalConfig,
        afterCommand: acknowledgement
          ? async () => {
              await this.codexPluginProfiles.awaitAcknowledgement(acknowledgement, {
                projectId: state.projectId,
                attemptNonce: acknowledgement.attemptNonce,
              });
            }
          : NOOP_AFTER_COMMAND,
        rollback: async () => this.rollbackPrepared(rollbackState(), false),
      });
    } catch (error) {
      await this.rollbackPrepared(
        {
          mode: state.mode,
          sessionId: state.sessionId,
          priorCapture,
          captureStarted,
          claudePrepared,
          preparedCodex,
        },
        true,
      );
      throw error;
    }
  }

  private assertNoPolicyConflict(
    providerName: string,
    profileOptionArgs: readonly string[],
    policyActive: boolean,
  ): void {
    if (
      policyActive &&
      providerName === 'claude' &&
      hasFlagOccurrence([...profileOptionArgs], '--settings')
    ) {
      throw new ConflictError(
        'Profile-supplied --settings conflicts with required DevChain Claude plugin policy.',
        { field: 'profileOptions', flag: '--settings' },
      );
    }
    if (
      policyActive &&
      providerName === 'codex' &&
      hasCodexProfileSelector([...profileOptionArgs])
    ) {
      throw new ConflictError(
        'Profile-supplied Codex profile selector conflicts with required DevChain plugin policy.',
        { field: 'profileOptions', flag: '--profile' },
      );
    }
  }

  private assertRestoreIdentity(
    config: LaunchConfig,
    providerName: string,
    providerSessionId: string,
  ): void {
    if (!config.argv.includes(providerSessionId)) {
      throw new ValidationError(
        'Restore argv does not include provider session ID — adapter contract violation',
        { providerName, providerSessionId },
      );
    }
  }

  private applyManagedOverlay(
    state: ProviderRuntimePlanState,
    preparedSettings: PreparedClaudeLaunchSettings,
    preparedCodex: PreparedCodexPluginProfile | null,
  ): LaunchConfig {
    const providerOptionArgs = [
      ...preparedSettings.optionArgs,
      ...(preparedCodex?.providerOptionArgs ?? []),
    ];
    if (providerOptionArgs.length === 0) return state.baseConfig;

    return this.freezeConfig(
      resolveLaunchConfig({
        ...state.baseInput,
        providerOptionArgs,
        runtimeEnv: preparedSettings.runtimeEnv,
      }),
    );
  }

  private wrapCodexCommand(
    state: ProviderRuntimePlanState,
    config: LaunchConfig,
    preparedCodex: PreparedCodexPluginProfile,
  ): LaunchConfig {
    const helperArgv = this.codexPluginProfiles.buildHelperArgv(
      preparedCodex,
      state.baseInput.providerBinPath,
      config.argv,
      { projectId: state.projectId, attemptNonce: preparedCodex.attemptNonce },
    );
    return {
      ...config,
      commandArgs: buildSessionCommand(config.env, helperArgv[0], helperArgv.slice(1), [
        ...new Set([...(state.baseInput.adapter.launchUnsetEnv ?? []), CONTEXT_WINDOW_ENV_KEY]),
      ]),
    };
  }

  private async rollbackPrepared(state: RollbackState, suppressError: boolean): Promise<void> {
    let firstError: unknown;
    const attempt = async (action: () => void | Promise<void>): Promise<void> => {
      try {
        await action();
      } catch (error) {
        firstError ??= error;
      }
    };

    if (state.preparedCodex) {
      const preparedCodex = state.preparedCodex;
      await attempt(() => this.codexPluginProfiles.cleanupPrepared(preparedCodex));
    }
    if (state.claudePrepared) {
      await attempt(() => this.claudeLaunchSettings.cleanupSession(state.sessionId));
    }
    if (state.captureStarted) {
      await attempt(() => {
        if (state.mode === 'restore') {
          this.runtimeContextCapture.restoreSnapshot(state.sessionId, state.priorCapture);
        } else {
          this.runtimeContextCapture.clear(state.sessionId);
        }
      });
    }

    if (!suppressError && firstError !== undefined) throw firstError;
  }

  private restoreProviderSessionId(state: ProviderRuntimePlanState): string {
    if (state.providerSessionId === null) {
      throw new ValidationError('Restore provider session ID is missing from the runtime plan.');
    }
    return state.providerSessionId;
  }

  private freezeConfig(config: LaunchConfig): LaunchConfig {
    const frozenConfig: LaunchConfig = {
      ...config,
      argv: [...config.argv],
      commandArgs: [...config.commandArgs],
      env: config.env ? { ...config.env } : null,
      promptHandshake: config.promptHandshake
        ? {
            ...config.promptHandshake,
            preKeys: config.promptHandshake.preKeys
              ? [...config.promptHandshake.preKeys]
              : undefined,
          }
        : undefined,
    };
    Object.freeze(frozenConfig.argv);
    Object.freeze(frozenConfig.commandArgs);
    if (frozenConfig.env) Object.freeze(frozenConfig.env);
    if (frozenConfig.promptHandshake?.preKeys) Object.freeze(frozenConfig.promptHandshake.preKeys);
    if (frozenConfig.promptHandshake) Object.freeze(frozenConfig.promptHandshake);
    return Object.freeze(frozenConfig);
  }
}
