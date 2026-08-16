export const PAIRED_DEVICE_WORKSPACE_ACCESS_REVOKED_EVENT = 'e2ee.device.workspace-access.revoked';

export interface PairedDeviceWorkspaceAccessRevokedEvent {
  readonly deviceKid: string;
  readonly reason: 'workspace-access-updated' | 'device-revoked';
  /** Omitted when every active lease for the device must be torn down. */
  readonly workspaceIds?: string[];
}
