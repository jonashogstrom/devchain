import { Injectable } from '@nestjs/common';
import type {
  DeleteProjectWorkspaceResult,
  ProjectWorkspace,
} from '../../storage/models/domain.models';
import { WorkspaceModeCoordinatorService } from './workspace-mode-coordinator.service';

@Injectable()
export class WorkspacesService {
  constructor(private readonly modeCoordinator: WorkspaceModeCoordinatorService) {}

  list(): Promise<ProjectWorkspace[]> {
    return this.modeCoordinator.list();
  }

  create(name: string): Promise<ProjectWorkspace> {
    return this.modeCoordinator.create(name);
  }

  rename(id: string, name: string): Promise<ProjectWorkspace> {
    return this.modeCoordinator.rename(id, name);
  }

  reorder(workspaceIds: string[]): Promise<ProjectWorkspace[]> {
    return this.modeCoordinator.reorder(workspaceIds);
  }

  delete(id: string, replacementWorkspaceId: string): Promise<DeleteProjectWorkspaceResult> {
    return this.modeCoordinator.delete(id, replacementWorkspaceId);
  }
}
