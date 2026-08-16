import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, type TestingModule } from '@nestjs/testing';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { NotFoundError, ValidationError } from '../../../common/errors/error-types';
import { DB_CONNECTION } from '../../storage/db/db.provider';
import { DEFAULT_PROJECT_WORKSPACE_ID } from '../../storage/db/schema';
import { PAIRED_DEVICE_WORKSPACE_ACCESS_REVOKED_EVENT } from '../events/paired-device-workspace-access.events';
import { E2eeDeviceStoreService } from './e2ee-device-store.service';
import { PairedDeviceWorkspaceAccessService } from './paired-device-workspace-access.service';

const SECOND_WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';
const KID_ONE = 'kid-one';
const KID_TWO = 'kid-two';

describe('PairedDeviceWorkspaceAccessService', () => {
  let sqlite: Database.Database;
  let devices: E2eeDeviceStoreService;
  let service: PairedDeviceWorkspaceAccessService;
  let emitter: { emit: jest.Mock };

  beforeEach(async () => {
    sqlite = new Database(':memory:');
    sqlite.exec(`
      CREATE TABLE settings (
        id TEXT PRIMARY KEY, key TEXT NOT NULL UNIQUE, value TEXT NOT NULL,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE project_workspaces (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, is_default INTEGER NOT NULL,
        position INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE paired_device_workspace_grants (
        device_kid TEXT NOT NULL, workspace_id TEXT NOT NULL,
        PRIMARY KEY (device_kid, workspace_id),
        FOREIGN KEY (workspace_id) REFERENCES project_workspaces(id) ON DELETE CASCADE
      );
    `);
    const insertWorkspace = sqlite.prepare(
      `INSERT INTO project_workspaces
       (id, name, is_default, position, created_at, updated_at)
       VALUES (?, ?, ?, ?, '2026-01-01', '2026-01-01')`,
    );
    insertWorkspace.run(DEFAULT_PROJECT_WORKSPACE_ID, 'Default', 1, 0);
    insertWorkspace.run(SECOND_WORKSPACE_ID, 'W2', 0, 1);
    emitter = { emit: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        E2eeDeviceStoreService,
        PairedDeviceWorkspaceAccessService,
        { provide: DB_CONNECTION, useValue: drizzle(sqlite) },
        { provide: EventEmitter2, useValue: emitter },
      ],
    }).compile();
    devices = module.get(E2eeDeviceStoreService);
    service = module.get(PairedDeviceWorkspaceAccessService);
    devices.add({ kid: KID_ONE, publicKeyB64: 'public-one' });
    devices.add({ kid: KID_TWO, publicKeyB64: 'public-two' });
    emitter.emit.mockClear();
  });

  afterEach(() => sqlite.close());

  it('distinguishes never-edited Default-only access from explicit Default', async () => {
    expect(service.getAccess(KID_ONE)).toEqual({
      kid: KID_ONE,
      explicit: false,
      workspaceIds: [DEFAULT_PROJECT_WORKSPACE_ID],
    });

    await expect(service.updateAccess(KID_ONE, [DEFAULT_PROJECT_WORKSPACE_ID])).resolves.toEqual({
      kid: KID_ONE,
      explicit: true,
      workspaceIds: [DEFAULT_PROJECT_WORKSPACE_ID],
    });
    expect(
      sqlite
        .prepare('SELECT workspace_id FROM paired_device_workspace_grants WHERE device_kid = ?')
        .all(KID_ONE),
    ).toEqual([{ workspace_id: DEFAULT_PROJECT_WORKSPACE_ID }]);
  });

  it('persists inverse exact subsets independently and permits omitting Default', async () => {
    await service.updateAccess(KID_ONE, [SECOND_WORKSPACE_ID]);
    await service.updateAccess(KID_TWO, [DEFAULT_PROJECT_WORKSPACE_ID]);

    expect(service.getAccess(KID_ONE).workspaceIds).toEqual([SECOND_WORKSPACE_ID]);
    expect(service.getAccess(KID_TWO).workspaceIds).toEqual([DEFAULT_PROJECT_WORKSPACE_ID]);
  });

  it('rejects empty subsets, unknown workspaces, and unknown or revoked kids', async () => {
    await expect(service.updateAccess(KID_ONE, [])).rejects.toBeInstanceOf(ValidationError);
    await expect(
      service.updateAccess(KID_ONE, ['22222222-2222-4222-8222-222222222222']),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(service.updateAccess('unknown', [SECOND_WORKSPACE_ID])).rejects.toBeInstanceOf(
      NotFoundError,
    );
    devices.revoke(KID_ONE);
    expect(() => service.getAccess(KID_ONE)).toThrow(NotFoundError);
  });

  it('emits only the workspace access removed by a committed edit', async () => {
    await service.updateAccess(KID_ONE, [DEFAULT_PROJECT_WORKSPACE_ID, SECOND_WORKSPACE_ID]);
    emitter.emit.mockClear();

    await service.updateAccess(KID_ONE, [SECOND_WORKSPACE_ID]);

    expect(emitter.emit).toHaveBeenCalledWith(PAIRED_DEVICE_WORKSPACE_ACCESS_REVOKED_EVENT, {
      deviceKid: KID_ONE,
      reason: 'workspace-access-updated',
      workspaceIds: [DEFAULT_PROJECT_WORKSPACE_ID],
    });
  });

  describe('same-kid reconnect continuity (paired-kid-continuity)', () => {
    const MULTI = [DEFAULT_PROJECT_WORKSPACE_ID, SECOND_WORKSPACE_ID];

    it('keeps explicit multi-workspace access and the alias across a same-kid re-add (QR seam)', async () => {
      await service.updateAccess(KID_ONE, MULTI);
      devices.setLocalAlias(KID_ONE, 'My Pixel');

      const reAdded = devices.add(
        { kid: KID_ONE, publicKeyB64: 'public-one', trust: 'verified', verifiedVia: 'qr' },
        { evictVerified: true },
      );

      expect(reAdded).toMatchObject({
        trust: 'verified',
        verifiedVia: 'qr',
        localAlias: 'My Pixel',
      });
      expect(service.getAccess(KID_ONE)).toEqual({
        kid: KID_ONE,
        explicit: true,
        workspaceIds: MULTI,
      });
    });

    it('keeps verified trust, explicit multi-workspace access, and the alias across a same-kid reconcile (email seam)', async () => {
      devices.markVerified(KID_ONE);
      devices.setLocalAlias(KID_ONE, 'My Pixel');
      await service.updateAccess(KID_ONE, MULTI);

      const reconnected = devices.reconcile({ kid: KID_ONE, publicKeyB64: 'public-one' });

      expect(reconnected).toMatchObject({ trust: 'verified', localAlias: 'My Pixel' });
      expect(service.getAccess(KID_ONE)).toEqual({
        kid: KID_ONE,
        explicit: true,
        workspaceIds: MULTI,
      });
    });

    it('desktop un-pair followed by same-kid re-adoption returns effective Default-only access with no alias', async () => {
      await service.updateAccess(KID_ONE, MULTI);
      devices.setLocalAlias(KID_ONE, 'My Pixel');

      devices.revoke(KID_ONE);
      expect(() => service.getAccess(KID_ONE)).toThrow(NotFoundError);

      devices.add(
        { kid: KID_ONE, publicKeyB64: 'public-one', trust: 'verified', verifiedVia: 'qr' },
        { evictVerified: true },
      );

      expect(devices.get(KID_ONE)).toMatchObject({ trust: 'verified' });
      expect(devices.get(KID_ONE)?.localAlias).toBeUndefined();
      expect(service.getAccess(KID_ONE)).toEqual({
        kid: KID_ONE,
        explicit: false,
        workspaceIds: [DEFAULT_PROJECT_WORKSPACE_ID],
      });
    });

    it('a genuinely new kid remains a fresh Default-only device', () => {
      devices.add({ kid: 'kid-new', publicKeyB64: 'public-new' });

      expect(devices.get('kid-new')?.localAlias).toBeUndefined();
      expect(service.getAccess('kid-new')).toEqual({
        kid: 'kid-new',
        explicit: false,
        workspaceIds: [DEFAULT_PROJECT_WORKSPACE_ID],
      });
    });
  });
});
