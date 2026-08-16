import { DEFAULT_PROJECT_WORKSPACE_ID } from '../../storage/db/schema';
import type { ProjectWorkspace } from '../../storage/models/domain.models';
import { WorkspacesService } from '../services/workspaces.service';
import { WorkspacesController } from './workspaces.controller';

const SECOND_WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';

function workspace(overrides: Partial<ProjectWorkspace> = {}): ProjectWorkspace {
  return {
    id: overrides.id ?? DEFAULT_PROJECT_WORKSPACE_ID,
    name: overrides.name ?? 'Default',
    isDefault: overrides.isDefault ?? true,
    position: overrides.position ?? 0,
    projectCount: overrides.projectCount ?? 1,
    deviceGrantCount: overrides.deviceGrantCount ?? 0,
    createdAt: overrides.createdAt ?? '2026-01-01T00:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-01-01T00:00:00.000Z',
  };
}

describe('WorkspacesController', () => {
  let controller: WorkspacesController;
  let service: jest.Mocked<WorkspacesService>;

  beforeEach(() => {
    service = {
      list: jest.fn(),
      create: jest.fn(),
      rename: jest.fn(),
      reorder: jest.fn(),
      delete: jest.fn(),
    } as unknown as jest.Mocked<WorkspacesService>;
    controller = new WorkspacesController(service);
  });

  it('returns the ordered management projection including immutable Default identity and counts', async () => {
    const result = [
      workspace(),
      workspace({
        id: SECOND_WORKSPACE_ID,
        name: 'Engineering',
        isDefault: false,
        position: 1,
        projectCount: 3,
        deviceGrantCount: 2,
      }),
    ];
    service.list.mockResolvedValue(result);

    await expect(controller.listWorkspaces()).resolves.toEqual(result);
    expect(service.list).toHaveBeenCalledTimes(1);
  });

  it('trims valid names and rejects blank, oversized, or unknown request fields before mutation', async () => {
    service.create.mockResolvedValue(workspace({ name: 'Renamed' }));

    await controller.createWorkspace({ name: '  Renamed  ' });
    expect(service.create).toHaveBeenCalledWith('Renamed');

    expect(() => controller.createWorkspace({ name: '   ' })).toThrow();
    expect(() => controller.createWorkspace({ name: 'x'.repeat(65) })).toThrow();
    expect(() => controller.createWorkspace({ name: 'Valid', extra: true })).toThrow();
    expect(service.create).toHaveBeenCalledTimes(1);
  });

  it('renames Default and forwards a validated full-set reorder', async () => {
    service.rename.mockResolvedValue(workspace({ name: 'Primary' }));
    service.reorder.mockResolvedValue([
      workspace({ id: SECOND_WORKSPACE_ID, isDefault: false, position: 0 }),
      workspace({ position: 1 }),
    ]);

    await controller.renameWorkspace(DEFAULT_PROJECT_WORKSPACE_ID, { name: ' Primary ' });
    await controller.reorderWorkspaces({
      workspaceIds: [SECOND_WORKSPACE_ID, DEFAULT_PROJECT_WORKSPACE_ID],
    });

    expect(service.rename).toHaveBeenCalledWith(DEFAULT_PROJECT_WORKSPACE_ID, 'Primary');
    expect(service.reorder).toHaveBeenCalledWith([
      SECOND_WORKSPACE_ID,
      DEFAULT_PROJECT_WORKSPACE_ID,
    ]);
  });

  it('requires a validated replacement and returns affected counts for replacement-delete', async () => {
    service.delete.mockResolvedValue({ movedProjectCount: 4, remappedDeviceGrantCount: 2 });

    await expect(
      controller.deleteWorkspace(SECOND_WORKSPACE_ID, {
        replacementWorkspaceId: DEFAULT_PROJECT_WORKSPACE_ID,
      }),
    ).resolves.toEqual({ movedProjectCount: 4, remappedDeviceGrantCount: 2 });
    expect(service.delete).toHaveBeenCalledWith(SECOND_WORKSPACE_ID, DEFAULT_PROJECT_WORKSPACE_ID);

    expect(() => controller.deleteWorkspace(SECOND_WORKSPACE_ID, {})).toThrow();
    expect(service.delete).toHaveBeenCalledTimes(1);
  });
});
