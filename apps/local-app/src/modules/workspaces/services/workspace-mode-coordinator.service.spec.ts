const mockLogger = {
  warn: jest.fn(),
};

jest.mock('../../../common/logging/logger', () => ({
  createLogger: jest.fn(() => mockLogger),
}));

import { DEFAULT_PROJECT_WORKSPACE_ID } from '../../storage/db/schema';
import type { StorageService } from '../../storage/interfaces/storage.interface';
import type { ProjectWorkspace } from '../../storage/models/domain.models';
import { PROJECT_WORKSPACE_CHANGED_EVENT } from '../../projects/events/project-workspace-changed.events';
import { WORKSPACE_MODE_CHANGED_EVENT, type WorkspaceModeSnapshot } from './workspace-mode-control';
import { WorkspaceModeCoordinatorService } from './workspace-mode-coordinator.service';

const workspace = (id: string, overrides: Partial<ProjectWorkspace> = {}): ProjectWorkspace => ({
  id,
  name: id === DEFAULT_PROJECT_WORKSPACE_ID ? 'Default' : id,
  isDefault: id === DEFAULT_PROJECT_WORKSPACE_ID,
  position: 0,
  projectCount: 0,
  deviceGrantCount: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

describe('WorkspaceModeCoordinatorService', () => {
  let storage: jest.Mocked<
    Pick<
      StorageService,
      | 'listProjectWorkspaces'
      | 'createProjectWorkspace'
      | 'renameProjectWorkspace'
      | 'reorderProjectWorkspaces'
      | 'deleteProjectWorkspace'
    >
  >;
  let service: WorkspaceModeCoordinatorService;
  let eventEmitter: { emit: jest.Mock };
  const defaultWorkspace = workspace(DEFAULT_PROJECT_WORKSPACE_ID);
  const secondWorkspace = workspace('workspace-2');

  beforeEach(() => {
    storage = {
      listProjectWorkspaces: jest.fn().mockResolvedValue([defaultWorkspace]),
      createProjectWorkspace: jest.fn().mockResolvedValue(secondWorkspace),
      renameProjectWorkspace: jest.fn(),
      reorderProjectWorkspaces: jest.fn(),
      deleteProjectWorkspace: jest
        .fn()
        .mockResolvedValue({ movedProjectCount: 0, remappedDeviceGrantCount: 0 }),
    };
    eventEmitter = { emit: jest.fn().mockReturnValue(true) };
    service = new WorkspaceModeCoordinatorService(
      storage as unknown as StorageService,
      eventEmitter as never,
    );
    mockLogger.warn.mockReset();
  });

  it('publishes pending before cleanup and a terminal snapshot after local creation', async () => {
    const order: string[] = [];
    const modeSnapshots: WorkspaceModeSnapshot[] = [];
    eventEmitter.emit.mockImplementation((eventName: string, event: WorkspaceModeSnapshot) => {
      if (eventName === WORKSPACE_MODE_CHANGED_EVENT) {
        order.push(event.failClosedPending ? 'pending' : 'terminal');
        modeSnapshots.push(event);
      }
      return true;
    });
    service.registerCleanupHook('chat', () => {
      order.push('local-cleanup');
    });
    storage.createProjectWorkspace.mockImplementation(async () => {
      order.push('create');
      return secondWorkspace;
    });

    await expect(service.create('Second')).resolves.toBe(secondWorkspace);

    expect(order).toEqual(['pending', 'local-cleanup', 'create', 'terminal']);
    expect(modeSnapshots).toEqual([
      { multiWorkspaceMode: false, failClosedPending: true },
      { multiWorkspaceMode: true, failClosedPending: false },
    ]);
    expect(eventEmitter.emit).toHaveBeenNthCalledWith(
      1,
      'workspace.mode.changed',
      modeSnapshots[0],
    );
    expect(eventEmitter.emit).toHaveBeenNthCalledWith(
      2,
      'workspace.mode.changed',
      modeSnapshots[1],
    );
    expect(storage.deleteProjectWorkspace).not.toHaveBeenCalled();
  });

  it('clears pending, publishes the single-workspace snapshot, and rethrows cleanup failures', async () => {
    const cleanupError = new Error('local cleanup failed');
    service.registerCleanupHook('chat', () => {
      throw cleanupError;
    });

    await expect(service.create('Second')).rejects.toBe(cleanupError);

    expect(storage.createProjectWorkspace).not.toHaveBeenCalled();
    expect(eventEmitter.emit).toHaveBeenNthCalledWith(1, 'workspace.mode.changed', {
      multiWorkspaceMode: false,
      failClosedPending: true,
    });
    expect(eventEmitter.emit).toHaveBeenNthCalledWith(2, 'workspace.mode.changed', {
      multiWorkspaceMode: false,
      failClosedPending: false,
    });
    await expect(service.getSnapshot()).resolves.toEqual({
      multiWorkspaceMode: false,
      failClosedPending: false,
    });
  });

  it('clears pending, publishes the single-workspace snapshot, and rethrows storage failures', async () => {
    const storageError = new Error('local storage failed');
    storage.createProjectWorkspace.mockRejectedValue(storageError);

    await expect(service.create('Second')).rejects.toBe(storageError);

    expect(eventEmitter.emit).toHaveBeenNthCalledWith(1, 'workspace.mode.changed', {
      multiWorkspaceMode: false,
      failClosedPending: true,
    });
    expect(eventEmitter.emit).toHaveBeenNthCalledWith(2, 'workspace.mode.changed', {
      multiWorkspaceMode: false,
      failClosedPending: false,
    });
    expect(storage.deleteProjectWorkspace).not.toHaveBeenCalled();
  });

  it('keeps successful local creation independent from synchronous mode listeners', async () => {
    const listenerError = new Error('listener failed');
    eventEmitter.emit.mockImplementation(() => {
      throw listenerError;
    });

    await expect(service.create('Second')).resolves.toBe(secondWorkspace);

    expect(storage.createProjectWorkspace).toHaveBeenCalledWith('Second');
    expect(storage.deleteProjectWorkspace).not.toHaveBeenCalled();
    expect(mockLogger.warn).toHaveBeenCalledTimes(2);
    expect(mockLogger.warn).toHaveBeenCalledWith(
      { error: listenerError, eventName: WORKSPACE_MODE_CHANGED_EVENT },
      'Local workspace event listener failed',
    );
  });

  it('publishes single-workspace mode after a 2-to-1 delete without rereading the list', async () => {
    const result = { movedProjectCount: 0, remappedDeviceGrantCount: 0 };
    const order: string[] = [];
    storage.listProjectWorkspaces.mockResolvedValue([defaultWorkspace, secondWorkspace]);
    storage.deleteProjectWorkspace.mockImplementation(async () => {
      order.push('delete');
      return result;
    });
    eventEmitter.emit.mockImplementation(() => {
      order.push('publish');
      return true;
    });

    await expect(service.delete(secondWorkspace.id, DEFAULT_PROJECT_WORKSPACE_ID)).resolves.toBe(
      result,
    );

    expect(order).toEqual(['delete', 'publish']);
    expect(storage.listProjectWorkspaces).toHaveBeenCalledTimes(1);
    expect(eventEmitter.emit).toHaveBeenCalledWith('workspace.mode.changed', {
      multiWorkspaceMode: false,
      failClosedPending: false,
    });
  });

  it('keeps a committed replacement delete independent from project event listeners', async () => {
    const result = { movedProjectCount: 2, remappedDeviceGrantCount: 1 };
    const listenerError = new Error('project listener failed');
    storage.listProjectWorkspaces.mockResolvedValue([defaultWorkspace, secondWorkspace]);
    storage.deleteProjectWorkspace.mockResolvedValue(result);
    eventEmitter.emit.mockImplementation((eventName: string) => {
      if (eventName === PROJECT_WORKSPACE_CHANGED_EVENT) throw listenerError;
      return true;
    });

    await expect(service.delete(secondWorkspace.id, DEFAULT_PROJECT_WORKSPACE_ID)).resolves.toBe(
      result,
    );

    expect(eventEmitter.emit).toHaveBeenNthCalledWith(1, PROJECT_WORKSPACE_CHANGED_EVENT, {
      previousWorkspaceId: secondWorkspace.id,
      workspaceId: DEFAULT_PROJECT_WORKSPACE_ID,
    });
    expect(eventEmitter.emit).toHaveBeenNthCalledWith(2, WORKSPACE_MODE_CHANGED_EVENT, {
      multiWorkspaceMode: false,
      failClosedPending: false,
    });
    expect(mockLogger.warn).toHaveBeenCalledWith(
      { error: listenerError, eventName: PROJECT_WORKSPACE_CHANGED_EVENT },
      'Local workspace event listener failed',
    );
  });

  it('serializes all workspace mutations across asynchronous callers', async () => {
    let finishRename!: (value: ProjectWorkspace) => void;
    storage.renameProjectWorkspace.mockReturnValue(
      new Promise((resolve) => {
        finishRename = resolve;
      }),
    );
    storage.reorderProjectWorkspaces.mockResolvedValue([defaultWorkspace]);

    const rename = service.rename(defaultWorkspace.id, 'Renamed');
    const reorder = service.reorder([defaultWorkspace.id]);
    await Promise.resolve();

    expect(storage.renameProjectWorkspace).toHaveBeenCalledTimes(1);
    expect(storage.reorderProjectWorkspaces).not.toHaveBeenCalled();
    finishRename(workspace(defaultWorkspace.id, { name: 'Renamed' }));
    await rename;
    await reorder;

    expect(storage.reorderProjectWorkspaces).toHaveBeenCalledTimes(1);
  });
});
