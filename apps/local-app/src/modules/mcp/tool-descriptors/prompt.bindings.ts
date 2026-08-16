import type { TeamsService } from '../../teams/services/teams.service';
import type { PromptToolContext } from '../services/handlers/prompt-context';
import { handleListPrompts, handleGetPrompt } from '../services/handlers/prompt-tools';
import { createNullAdapter } from '../services/handlers/null-adapter';
import { defineToolGroup, type McpBindingRuntime } from './binding-types';

function createPromptContext(runtime: McpBindingRuntime): PromptToolContext {
  return {
    storage: runtime.storage,
    teamsService: runtime.teamsService ?? createNullAdapter<TeamsService>('TeamsService'),
    resolveSessionContext: runtime.resolveSessionContext,
  };
}

export const promptBindings = defineToolGroup<PromptToolContext>(createPromptContext, [
  ['devchain_list_prompts', handleListPrompts],
  ['devchain_get_prompt', handleGetPrompt],
]);
