import type {
  CreateFromTemplateInput,
  CreateFromTemplateResponse,
  ImportDryRunResponse,
  ImportProjectResponse,
  PathStatResult,
  ProjectWorkspace,
  DeleteProjectWorkspaceResult,
  ProjectPreMutationFailure,
  Project,
  ProjectsQueryData,
  ProjectTemplate,
  SetupPreviewRequest,
  SetupPreviewResponse,
  TemplateManifest,
  UpdateProjectInput,
  UpdateProjectResponse,
  UpgradeProjectResponse,
} from '@/ui/pages/projects/lib/project-contracts';
import { isProjectPreMutationFailure } from '@/ui/pages/projects/lib/project-failures';
import type { ProjectsPageApi } from '@/ui/pages/projects/lib/projects-page-api';
import type { WorkspaceTransitionDevice } from '@/ui/pages/projects/lib/projects-page-api';

async function postConfiguredReplace<T>(url: string, body: Record<string, unknown>): Promise<T> {
  const response = await window.fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(
      error.message || error.error || `Request failed with status ${response.status}`,
    );
  }
  return response.json();
}

export class ProjectsHttpApi implements ProjectsPageApi {
  async listProjects(): Promise<ProjectsQueryData> {
    const response = await window.fetch('/api/projects');
    if (!response.ok) throw new Error('Failed to fetch projects');
    const data = (await response.json()) as ProjectsQueryData;

    const items = await Promise.all(
      data.items.map(async (project: Project) => {
        try {
          const statsResponse = await window.fetch(`/api/projects/${project.id}/stats`);
          if (statsResponse.ok) {
            return { ...project, stats: await statsResponse.json() };
          }
        } catch {
          // Project statistics are supplementary; the project list remains usable without them.
        }
        return project;
      }),
    );

    return { ...data, items };
  }

  async listWorkspaces(): Promise<ProjectWorkspace[]> {
    const response = await window.fetch('/api/workspaces');
    if (!response.ok) throw new Error('Failed to fetch workspaces');
    return response.json();
  }

  async listPairedDevices(): Promise<WorkspaceTransitionDevice[]> {
    const response = await window.fetch('/api/e2ee/devices');
    if (!response.ok) throw new Error('Failed to fetch paired devices');
    return response.json();
  }

  async createWorkspace(name: string): Promise<ProjectWorkspace> {
    return this.workspaceRequest('/api/workspaces', 'POST', { name });
  }

  async renameWorkspace(workspaceId: string, name: string): Promise<ProjectWorkspace> {
    return this.workspaceRequest(`/api/workspaces/${encodeURIComponent(workspaceId)}`, 'PATCH', {
      name,
    });
  }

  async reorderWorkspaces(workspaceIds: string[]): Promise<ProjectWorkspace[]> {
    return this.workspaceRequest('/api/workspaces/reorder', 'PUT', { workspaceIds });
  }

  async deleteWorkspace(
    workspaceId: string,
    replacementWorkspaceId: string,
  ): Promise<DeleteProjectWorkspaceResult> {
    return this.workspaceRequest(`/api/workspaces/${encodeURIComponent(workspaceId)}`, 'DELETE', {
      replacementWorkspaceId,
    });
  }

  private async workspaceRequest<T>(
    url: string,
    method: 'POST' | 'PATCH' | 'PUT' | 'DELETE',
    body: Record<string, unknown>,
  ): Promise<T> {
    const response = await window.fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || error.error || 'Workspace request failed');
    }
    return response.json();
  }

  async statPath(path: string): Promise<PathStatResult> {
    const response = await window.fetch('/api/fs/stat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
    });
    if (!response.ok) return { exists: false, isFile: false };
    const stat = (await response.json()) as Partial<PathStatResult>;
    return { exists: stat.exists === true, isFile: stat.isFile === true };
  }

  async listTemplates(): Promise<ProjectTemplate[]> {
    const response = await window.fetch('/api/templates');
    if (!response.ok) throw new Error('Failed to fetch templates');
    const data = (await response.json()) as { templates: ProjectTemplate[] };
    return data.templates.map(({ slug, name, source, versions, latestVersion }) => ({
      slug,
      name,
      source,
      versions,
      latestVersion,
    }));
  }

  async readTemplateManifest(projectId: string): Promise<TemplateManifest | null> {
    try {
      const response = await window.fetch(`/api/projects/${projectId}/template-manifest`);
      if (!response.ok) return null;
      return (await response.json()) as TemplateManifest | null;
    } catch {
      return null;
    }
  }

  async createFromTemplate(input: CreateFromTemplateInput): Promise<CreateFromTemplateResponse> {
    const response = await window.fetch('/api/projects/from-template', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...input, version: input.version || null }),
    });
    if (!response.ok) {
      const error = await response
        .json()
        .catch(() => ({ message: 'Failed to create project from template' }));
      throw new Error(error.message || 'Failed to create project from template');
    }
    return response.json();
  }

  async updateProject(
    projectId: string,
    input: UpdateProjectInput,
  ): Promise<UpdateProjectResponse> {
    const response = await window.fetch(`/api/projects/${projectId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Failed to update project' }));
      throw new Error(error.message || 'Failed to update project');
    }
    return response.json();
  }

  async deleteProject(projectId: string): Promise<void> {
    const response = await window.fetch(`/api/projects/${projectId}`, { method: 'DELETE' });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Failed to delete project' }));
      throw new Error(error.message || 'Failed to delete project');
    }
  }

  async loadSetupPreview(request: SetupPreviewRequest): Promise<SetupPreviewResponse> {
    const response = await window.fetch('/api/projects/setup-preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
    if (!response.ok) {
      const error = await response
        .json()
        .catch(() => ({ message: 'Failed to load template preview' }));
      throw new Error(error.message || 'Failed to load template preview');
    }
    return response.json();
  }

  async loadUpgradePreview(
    projectId: string,
    targetVersion: string,
  ): Promise<SetupPreviewResponse> {
    const response = await window.fetch(
      `/api/projects/${encodeURIComponent(projectId)}/upgrade-template/preview`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetVersion }),
      },
    );
    const result = (await response.json().catch(() => ({
      success: false,
      mutationStarted: false,
      error: 'Failed to load upgrade preview',
    }))) as SetupPreviewResponse | ProjectPreMutationFailure;
    if (isProjectPreMutationFailure(result)) throw new Error(result.error);
    if (!response.ok) throw new Error('Failed to load upgrade preview');
    return result;
  }

  runImportDryRun(
    projectId: string,
    input: Record<string, unknown>,
  ): Promise<ImportDryRunResponse> {
    return postConfiguredReplace(
      `/api/projects/${encodeURIComponent(projectId)}/import?dryRun=true`,
      input,
    );
  }

  commitImport(projectId: string, input: Record<string, unknown>): Promise<ImportProjectResponse> {
    return postConfiguredReplace(`/api/projects/${encodeURIComponent(projectId)}/import`, input);
  }

  commitUpgrade(
    projectId: string,
    input: Record<string, unknown>,
  ): Promise<UpgradeProjectResponse> {
    return postConfiguredReplace(
      `/api/projects/${encodeURIComponent(projectId)}/upgrade-template`,
      input,
    );
  }
}

export const projectsHttpApi = new ProjectsHttpApi();
