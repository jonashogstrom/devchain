import { Body, Controller, Delete, Get, Param, Patch, Post, Put } from '@nestjs/common';
import { z } from 'zod';
import { ValidationError } from '../../../common/errors/error-types';
import {
  E2eeTrustService,
  type DeviceSafetyNumberResult,
  type DeviceTrustResult,
  type PairedDeviceSummary,
} from '../services/e2ee-trust.service';
import {
  PairedDeviceWorkspaceAccessService,
  type PairedDeviceWorkspaceAccess,
} from '../services/paired-device-workspace-access.service';

interface AdoptBody {
  kid?: string;
  publicKeyB64?: string;
  label?: string;
}

const WorkspaceAccessBodySchema = z
  .object({
    workspaceIds: z
      .array(z.string().uuid())
      .min(1)
      .refine((ids) => new Set(ids).size === ids.length, 'workspaceIds must be unique'),
  })
  .strict();

const LocalAliasBodySchema = z
  .object({
    localAlias: z
      .union([z.string().trim().max(120), z.null()])
      .transform((value) => (value === '' ? null : value)),
  })
  .strict();

/**
 * Renderer-facing endpoints for the shared E2EE trust surface (Phase-1 Task:8):
 *   GET    /api/e2ee/devices                     → paired devices (metadata only) for the UI list
 *   GET    /api/e2ee/devices/:kid/safety-number  → the compare fingerprint (QrDisplayPanel)
 *   POST   /api/e2ee/devices/:kid/verify         → mark VERIFIED after a matching compare
 *   PATCH  /api/e2ee/devices/:kid                → set or clear a PC-local alias
 *   DELETE /api/e2ee/devices/:kid                → un-pair (remove a stale/old device)
 *   POST   /api/e2ee/devices/adopt               → email-TOFU adopt / re-pair seam
 * QR pairing (Task:4) already verifies on the visual channel; these add the email-TOFU +
 * on-demand-verify legs so both login paths converge on one trust model.
 */
@Controller('api/e2ee/devices')
export class E2eeTrustController {
  constructor(
    private readonly trust: E2eeTrustService,
    private readonly workspaceAccess: PairedDeviceWorkspaceAccessService,
  ) {}

  @Get()
  listDevices(): PairedDeviceSummary[] {
    return this.trust.listDevices();
  }

  @Get(':kid/safety-number')
  async safetyNumber(@Param('kid') kid: string): Promise<DeviceSafetyNumberResult> {
    return this.trust.getSafetyNumber(kid);
  }

  @Get(':kid/workspaces')
  getWorkspaceAccess(@Param('kid') kid: string): PairedDeviceWorkspaceAccess {
    return this.workspaceAccess.getAccess(kid);
  }

  @Put(':kid/workspaces')
  updateWorkspaceAccess(
    @Param('kid') kid: string,
    @Body() body: unknown,
  ): Promise<PairedDeviceWorkspaceAccess> {
    const { workspaceIds } = WorkspaceAccessBodySchema.parse(body);
    return this.workspaceAccess.updateAccess(kid, workspaceIds);
  }

  @Post(':kid/verify')
  verify(@Param('kid') kid: string): DeviceTrustResult {
    return this.trust.verifyDevice(kid);
  }

  @Patch(':kid')
  setLocalAlias(@Param('kid') kid: string, @Body() body: unknown): PairedDeviceSummary {
    const { localAlias } = LocalAliasBodySchema.parse(body);
    return this.trust.setLocalAlias(kid, localAlias);
  }

  @Delete(':kid')
  revokeDevice(@Param('kid') kid: string): { kid: string; removed: boolean } {
    return this.trust.revokeDevice(kid);
  }

  @Post('adopt')
  adopt(@Body() body: AdoptBody): DeviceTrustResult {
    if (!body?.kid || !body.publicKeyB64) {
      throw new ValidationError('kid and publicKeyB64 are required');
    }
    return this.trust.adoptPeerKeyTofu({
      kid: body.kid,
      publicKeyB64: body.publicKeyB64,
      ...(body.label !== undefined ? { label: body.label } : {}),
    });
  }
}
