export interface SyncError {
  sourceName: string;
  skillSlug?: string;
  message: string;
}

export interface SyncResult {
  status: 'completed' | 'already_running';
  added: number;
  updated: number;
  removed: number;
  failed: number;
  unchanged: number;
  errors: SyncError[];
}
