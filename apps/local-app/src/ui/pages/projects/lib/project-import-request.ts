import type {
  ProjectTemplate,
  SetupPreviewRequest,
} from '@/ui/pages/projects/lib/project-contracts';

export const importFileParseFailureToast = {
  title: 'Import failed',
  description: 'Unable to read or parse the selected JSON file.',
  variant: 'destructive',
} as const;

export function createTemplateImportRequest(
  slug: string,
  source: ProjectTemplate['source'] | undefined,
  version: string,
): SetupPreviewRequest {
  return {
    slug,
    ...(source === 'registry' && version ? { version } : {}),
  };
}

export async function createFileImportRequest(
  file: Pick<File, 'text'>,
): Promise<SetupPreviewRequest> {
  return { rawContent: JSON.parse(await file.text()) as Record<string, unknown> };
}
