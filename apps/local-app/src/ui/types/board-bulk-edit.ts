import type { Epic } from '@/ui/types/domain';

export interface BoardBulkEditRow {
  readonly epic: Epic;
  readonly statusId: string;
  readonly agentId: string | null;
}

export interface BoardBulkEditController {
  readonly isOpen: boolean;
  readonly rows: readonly BoardBulkEditRow[];
  readonly error: string | null;
  readonly isLoading: boolean;
  readonly isSubmitting: boolean;
  readonly canSubmit: boolean;
  open(epic: Epic): void;
  close(): void;
  changeRow(epicId: string, field: 'statusId' | 'agentId', value: string | null): void;
  submit(): void;
}
