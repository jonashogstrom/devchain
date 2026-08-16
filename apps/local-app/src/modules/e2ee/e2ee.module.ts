import { Module } from '@nestjs/common';
import { E2eeKeypairService } from './services/e2ee-keypair.service';
import { E2eeDeviceStoreService } from './services/e2ee-device-store.service';
import { E2eePairingService } from './services/e2ee-pairing.service';
import { E2eeTrustService } from './services/e2ee-trust.service';
import { E2eePairingController } from './controllers/e2ee-pairing.controller';
import { E2eeTrustController } from './controllers/e2ee-trust.controller';
import { EventsInfraModule } from '../events/events-infra.module';
import { PairedDeviceWorkspaceAccessService } from './services/paired-device-workspace-access.service';

/**
 * Dedicated X25519 E2EE crypto foundation (Phase 1, Task:3 + Task:4).
 *
 * Owns the PC-side E2EE keypair lifecycle (generate / encrypted-at-rest persist / load)
 * under a SEPARATE namespace from the Ed25519 tunnel identity, the peer-device
 * public-key + trust directory, and the QR auto-verified key EXCHANGE (Task:4:
 * `E2eePairingService` + its renderer-facing controller). Envelope sealing (Phase 2+)
 * consumes these services. `DB_CONNECTION` is provided globally by `DbModule`.
 */
@Module({
  imports: [EventsInfraModule],
  controllers: [E2eePairingController, E2eeTrustController],
  providers: [
    E2eeKeypairService,
    E2eeDeviceStoreService,
    E2eePairingService,
    E2eeTrustService,
    PairedDeviceWorkspaceAccessService,
  ],
  exports: [
    E2eeKeypairService,
    E2eeDeviceStoreService,
    E2eePairingService,
    E2eeTrustService,
    PairedDeviceWorkspaceAccessService,
  ],
})
export class E2eeModule {}
