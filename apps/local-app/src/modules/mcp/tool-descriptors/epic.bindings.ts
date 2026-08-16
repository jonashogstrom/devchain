import type { EpicsService } from '../../epics/services/epics.service';
import type { EpicToolContext } from '../services/handlers/epic-context';
import {
  handleListEpics,
  handleListAssignedEpicsTasks,
  handleCreateEpic,
  handleGetEpicById,
  handleAddEpicComment,
  handleUpdateEpic,
  handleDeleteEpic,
} from '../services/handlers/epic-tools';
import { createNullAdapter } from '../services/handlers/null-adapter';
import { defineToolGroup, type McpBindingRuntime } from './binding-types';

function createEpicContext(runtime: McpBindingRuntime): EpicToolContext {
  return {
    storage: runtime.storage,
    epicsService: runtime.epicsService ?? createNullAdapter<EpicsService>('EpicsService'),
    resolveSessionContext: runtime.resolveSessionContext,
  };
}

export const epicBindings = defineToolGroup<EpicToolContext>(createEpicContext, [
  ['devchain_list_epics', handleListEpics],
  ['devchain_list_assigned_epics_tasks', handleListAssignedEpicsTasks],
  ['devchain_create_epic', handleCreateEpic],
  ['devchain_get_epic_by_id', handleGetEpicById],
  ['devchain_add_epic_comment', handleAddEpicComment],
  ['devchain_update_epic', handleUpdateEpic],
  ['devchain_delete_epic', handleDeleteEpic],
]);
