export const PROJECT_WORKSPACE_CHANGED_EVENT = 'project.workspace.changed';

export interface ProjectWorkspaceChangedEvent {
  /** Omitted when every project in the previous workspace moved as one transaction. */
  readonly projectId?: string;
  readonly previousWorkspaceId: string;
  readonly workspaceId: string;
}
