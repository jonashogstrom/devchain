export const WORKSPACE_MODE_CHANGED_EVENT = 'workspace.mode.changed';

export interface WorkspaceModeSnapshot {
  readonly multiWorkspaceMode: boolean;
  readonly failClosedPending: boolean;
}

export type WorkspaceModeCleanupHook = () => void | Promise<void>;
