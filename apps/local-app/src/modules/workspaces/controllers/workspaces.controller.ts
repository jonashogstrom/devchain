import { Body, Controller, Delete, Get, Param, Patch, Post, Put } from '@nestjs/common';
import { z } from 'zod';
import { createLogger } from '../../../common/logging/logger';
import type {
  DeleteProjectWorkspaceResult,
  ProjectWorkspace,
} from '../../storage/models/domain.models';
import { WorkspacesService } from '../services/workspaces.service';

const logger = createLogger('WorkspacesController');

const WorkspaceIdSchema = z.string().uuid();
const WorkspaceNameSchema = z.string().trim().min(1).max(64);
const WorkspaceNameBodySchema = z.object({ name: WorkspaceNameSchema }).strict();
const ReorderWorkspacesSchema = z
  .object({ workspaceIds: z.array(WorkspaceIdSchema).min(1) })
  .strict();
const DeleteWorkspaceSchema = z.object({ replacementWorkspaceId: WorkspaceIdSchema }).strict();

@Controller('api/workspaces')
export class WorkspacesController {
  constructor(private readonly workspaces: WorkspacesService) {}

  @Get()
  listWorkspaces(): Promise<ProjectWorkspace[]> {
    logger.info('GET /api/workspaces');
    return this.workspaces.list();
  }

  @Post()
  createWorkspace(@Body() body: unknown): Promise<ProjectWorkspace> {
    logger.info('POST /api/workspaces');
    const { name } = WorkspaceNameBodySchema.parse(body);
    return this.workspaces.create(name);
  }

  @Put('reorder')
  reorderWorkspaces(@Body() body: unknown): Promise<ProjectWorkspace[]> {
    logger.info('PUT /api/workspaces/reorder');
    const { workspaceIds } = ReorderWorkspacesSchema.parse(body);
    return this.workspaces.reorder(workspaceIds);
  }

  @Patch(':id')
  renameWorkspace(@Param('id') id: string, @Body() body: unknown): Promise<ProjectWorkspace> {
    logger.info({ workspaceId: id }, 'PATCH /api/workspaces/:id');
    const workspaceId = WorkspaceIdSchema.parse(id);
    const { name } = WorkspaceNameBodySchema.parse(body);
    return this.workspaces.rename(workspaceId, name);
  }

  @Delete(':id')
  deleteWorkspace(
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<DeleteProjectWorkspaceResult> {
    logger.info({ workspaceId: id }, 'DELETE /api/workspaces/:id');
    const workspaceId = WorkspaceIdSchema.parse(id);
    const { replacementWorkspaceId } = DeleteWorkspaceSchema.parse(body);
    return this.workspaces.delete(workspaceId, replacementWorkspaceId);
  }
}
