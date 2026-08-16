import type { GuestsService } from '../../guests/services/guests.service';
import type { SessionsService } from '../../sessions/services/sessions.service';
import type { SessionToolContext } from '../services/handlers/session-context';
import { handleListSessions, handleRegisterGuest } from '../services/handlers/session-tools';
import { createNullAdapter } from '../services/handlers/null-adapter';
import { defineToolGroup, type McpBindingRuntime } from './binding-types';

function createSessionContext(runtime: McpBindingRuntime): SessionToolContext {
  return {
    storage: runtime.storage,
    sessionsService:
      runtime.sessionsService ?? createNullAdapter<SessionsService>('SessionsService'),
    guestsService: runtime.guestsService ?? createNullAdapter<GuestsService>('GuestsService'),
  };
}

export const sessionBindings = defineToolGroup<SessionToolContext>(createSessionContext, [
  ['devchain_list_sessions', handleListSessions],
  ['devchain_register_guest', handleRegisterGuest],
]);
