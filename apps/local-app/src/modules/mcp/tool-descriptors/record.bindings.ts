import type { RecordToolContext } from '../services/handlers/record-context';
import {
  handleCreateRecord,
  handleUpdateRecord,
  handleGetRecord,
  handleListRecords,
  handleAddTags,
  handleRemoveTags,
} from '../services/handlers/record-tools';
import { defineToolGroup, type McpBindingRuntime } from './binding-types';

function createRecordContext(runtime: McpBindingRuntime): RecordToolContext {
  return { storage: runtime.storage };
}

export const recordBindings = defineToolGroup<RecordToolContext>(createRecordContext, [
  ['devchain_create_record', handleCreateRecord],
  ['devchain_update_record', handleUpdateRecord],
  ['devchain_get_record', handleGetRecord],
  ['devchain_list_records', handleListRecords],
  ['devchain_add_tags', handleAddTags],
  ['devchain_remove_tags', handleRemoveTags],
]);
