import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundError, ValidationError } from '../../../common/errors/error-types';
import { E2eeTrustService } from '../services/e2ee-trust.service';
import { E2eeTrustController } from './e2ee-trust.controller';
import { PairedDeviceWorkspaceAccessService } from '../services/paired-device-workspace-access.service';

describe('E2eeTrustController', () => {
  let controller: E2eeTrustController;
  let service: {
    listDevices: jest.Mock;
    getSafetyNumber: jest.Mock;
    verifyDevice: jest.Mock;
    revokeDevice: jest.Mock;
    adoptPeerKeyTofu: jest.Mock;
    setLocalAlias: jest.Mock;
  };
  let workspaceAccess: { getAccess: jest.Mock; updateAccess: jest.Mock };

  beforeEach(async () => {
    service = {
      listDevices: jest
        .fn()
        .mockReturnValue([
          { kid: 'k', label: 'Pixel', trust: 'unverified', addedAt: '2026-06-20T00:00:00Z' },
        ]),
      getSafetyNumber: jest
        .fn()
        .mockResolvedValue({ kid: 'k', safetyNumber: '00000 00000', trust: 'unverified' }),
      verifyDevice: jest
        .fn()
        .mockReturnValue({ kid: 'k', trust: 'verified', verifiedVia: 'safety-number' }),
      revokeDevice: jest.fn().mockReturnValue({ kid: 'k', removed: true }),
      adoptPeerKeyTofu: jest.fn().mockReturnValue({ kid: 'k', trust: 'unverified' }),
      setLocalAlias: jest.fn().mockImplementation((kid: string, localAlias: string | null) => ({
        kid,
        label: 'Pixel',
        ...(localAlias !== null ? { localAlias } : {}),
        trust: 'unverified',
        addedAt: '2026-06-20T00:00:00Z',
      })),
    };
    workspaceAccess = {
      getAccess: jest.fn().mockReturnValue({ kid: 'k', explicit: false, workspaceIds: ['w1'] }),
      updateAccess: jest.fn().mockResolvedValue({ kid: 'k', explicit: true, workspaceIds: ['w2'] }),
    };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [E2eeTrustController],
      providers: [
        { provide: E2eeTrustService, useValue: service },
        { provide: PairedDeviceWorkspaceAccessService, useValue: workspaceAccess },
      ],
    }).compile();
    controller = module.get(E2eeTrustController);
  });

  it('listDevices returns the paired-device metadata list', () => {
    const res = controller.listDevices();
    expect(service.listDevices).toHaveBeenCalled();
    expect(res).toEqual([
      { kid: 'k', label: 'Pixel', trust: 'unverified', addedAt: '2026-06-20T00:00:00Z' },
    ]);
  });

  it('safetyNumber delegates to the service with the kid', async () => {
    const res = await controller.safetyNumber('k');
    expect(service.getSafetyNumber).toHaveBeenCalledWith('k');
    expect(res.safetyNumber).toBe('00000 00000');
  });

  it('verify delegates to the service and returns the verified trust', () => {
    const res = controller.verify('k');
    expect(service.verifyDevice).toHaveBeenCalledWith('k');
    expect(res.trust).toBe('verified');
  });

  it('gets and replaces an exact validated workspace subset', async () => {
    expect(controller.getWorkspaceAccess('k')).toEqual({
      kid: 'k',
      explicit: false,
      workspaceIds: ['w1'],
    });
    const workspaceId = '11111111-1111-4111-8111-111111111111';
    await expect(
      controller.updateWorkspaceAccess('k', { workspaceIds: [workspaceId] }),
    ).resolves.toEqual({ kid: 'k', explicit: true, workspaceIds: ['w2'] });
    expect(workspaceAccess.updateAccess).toHaveBeenCalledWith('k', [workspaceId]);
    expect(() => controller.updateWorkspaceAccess('k', { workspaceIds: [] })).toThrow();
  });

  it('revokeDevice un-pairs via the service', () => {
    const res = controller.revokeDevice('k');
    expect(service.revokeDevice).toHaveBeenCalledWith('k');
    expect(res).toEqual({ kid: 'k', removed: true });
  });

  it('renames with a trimmed alias and clears blank/null aliases', () => {
    expect(controller.setLocalAlias('k', { localAlias: '  Personal  ' })).toMatchObject({
      localAlias: 'Personal',
    });
    expect(service.setLocalAlias).toHaveBeenLastCalledWith('k', 'Personal');

    controller.setLocalAlias('k', { localAlias: '   ' });
    expect(service.setLocalAlias).toHaveBeenLastCalledWith('k', null);
    controller.setLocalAlias('k', { localAlias: null });
    expect(service.setLocalAlias).toHaveBeenLastCalledWith('k', null);
  });

  it('strictly validates rename bodies and caps aliases at 120 characters', () => {
    expect(() => controller.setLocalAlias('k', { localAlias: 'x'.repeat(121) })).toThrow();
    expect(() => controller.setLocalAlias('k', { localAlias: 'Phone', extra: true })).toThrow();
    expect(() => controller.setLocalAlias('k', {})).toThrow();
  });

  it('propagates NotFound for an unknown device rename', () => {
    const notFound = new NotFoundError('E2EE device', 'missing');
    service.setLocalAlias.mockImplementationOnce(() => {
      throw notFound;
    });
    expect(notFound.statusCode).toBe(404);
    expect(() => controller.setLocalAlias('missing', { localAlias: 'Phone' })).toThrow(notFound);
  });

  it('adopt forwards the relayed key to the service', () => {
    const res = controller.adopt({ kid: 'k', publicKeyB64: 'pub', label: 'Pixel' });
    expect(service.adoptPeerKeyTofu).toHaveBeenCalledWith({
      kid: 'k',
      publicKeyB64: 'pub',
      label: 'Pixel',
    });
    expect(res.trust).toBe('unverified');
  });

  it('adopt rejects when kid or publicKeyB64 is missing', () => {
    expect(() => controller.adopt({ kid: 'k' })).toThrow(ValidationError);
    expect(service.adoptPeerKeyTofu).not.toHaveBeenCalled();
  });
});
