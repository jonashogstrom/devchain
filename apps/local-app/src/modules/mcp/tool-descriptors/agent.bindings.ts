import { createNullAdapter } from '../services/handlers/null-adapter';
import type { AgentToolContext } from '../services/handlers/agent-context';
import {
  handleListAgents,
  handleGetAgentByName,
  handleListStatuses,
} from '../services/handlers/agent-tools';
import type { SessionsService } from '../../sessions/services/sessions.service';
import type { TeamsService } from '../../teams/services/teams.service';
import type { TerminalIOService } from '../../terminal/services/terminal-io/terminal-io.service';
import { defineToolGroup, type McpBindingRuntime } from './binding-types';

function createAgentContext(runtime: McpBindingRuntime): AgentToolContext {
  return {
    storage: runtime.storage,
    sessionsService:
      runtime.sessionsService ?? createNullAdapter<SessionsService>('SessionsService'),
    terminalIO: runtime.terminalIO ?? createNullAdapter<TerminalIOService>('TerminalIOService'),
    instructionsResolver: runtime.instructionsResolver,
    teamsService: runtime.teamsService ?? createNullAdapter<TeamsService>('TeamsService'),
    defaultInlineMaxBytes: runtime.defaultInlineMaxBytes,
    resolveSessionContext: runtime.resolveSessionContext,
  };
}

export const agentBindings = defineToolGroup<AgentToolContext>(createAgentContext, [
  ['devchain_list_agents', handleListAgents],
  ['devchain_get_agent_by_name', handleGetAgentByName],
  ['devchain_list_statuses', handleListStatuses],
]);
