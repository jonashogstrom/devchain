import type { ZodSchema } from 'zod';

export interface ToolMetadataEntry {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  paramsSchema: ZodSchema | null;
}
