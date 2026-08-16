import type { DocumentToolContext } from '../services/handlers/document-context';
import {
  handleListDocuments,
  handleGetDocument,
  handleCreateDocument,
  handleUpdateDocument,
} from '../services/handlers/document-tools';
import { defineToolGroup, type McpBindingRuntime } from './binding-types';

function createDocumentContext(runtime: McpBindingRuntime): DocumentToolContext {
  return {
    storage: runtime.storage,
    defaultInlineMaxBytes: runtime.defaultInlineMaxBytes,
    resolveSessionContext: runtime.resolveSessionContext,
  };
}

export const documentBindings = defineToolGroup<DocumentToolContext>(createDocumentContext, [
  ['devchain_list_documents', handleListDocuments],
  ['devchain_get_document', handleGetDocument],
  ['devchain_create_document', handleCreateDocument],
  ['devchain_update_document', handleUpdateDocument],
]);
