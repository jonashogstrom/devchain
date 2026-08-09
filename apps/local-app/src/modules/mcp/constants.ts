export const DOCUMENT_TOOLS_ENABLED = false;
export const RECORDS_TOOLS_ENABLED = false;

export const DOCUMENT_TOOL_NAMES = [
  'devchain_list_documents',
  'devchain_get_document',
  'devchain_create_document',
  'devchain_update_document',
];

export const RECORDS_TOOL_NAMES = [
  'devchain_create_record',
  'devchain_update_record',
  'devchain_get_record',
  'devchain_list_records',
  'devchain_add_tags',
  'devchain_remove_tags',
];

export function filterHiddenTools<T extends { name: string }>(tools: T[]): T[] {
  const hidden = new Set<string>();
  if (!DOCUMENT_TOOLS_ENABLED) {
    DOCUMENT_TOOL_NAMES.forEach((name) => hidden.add(name));
  }
  if (!RECORDS_TOOLS_ENABLED) {
    RECORDS_TOOL_NAMES.forEach((name) => hidden.add(name));
  }
  if (!hidden.size) return tools;
  return tools.filter((tool) => !hidden.has(tool.name));
}
