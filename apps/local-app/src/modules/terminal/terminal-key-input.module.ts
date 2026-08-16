import { Module } from '@nestjs/common';
import { TerminalModule } from './terminal.module';
import { TerminalKeyInputFacade } from './services/terminal-key-input/terminal-key-input.facade';

/**
 * NARROW facade module for discrete mobile key input. Imports ONLY `TerminalModule` — it
 * exports `TerminalSessionRegistry` and re-exports `TerminalDeliveryModule` (→
 * `TerminalIOService`) — and exports ONLY {@link TerminalKeyInputFacade}.
 *
 * `CloudTunnelModule` imports THIS module, not `TerminalModule` wholesale, to keep its
 * terminal dependency limited to the key-input capability.
 *
 * Unlike `TerminalViewportModule`, `ProcessExecutorModule` is NOT imported here:
 * `TerminalIOService` wraps the executor internally (it owns its own sendControl/liveness
 * path), so this facade has no direct dependency on the executor port.
 */
@Module({
  imports: [TerminalModule],
  providers: [TerminalKeyInputFacade],
  exports: [TerminalKeyInputFacade],
})
export class TerminalKeyInputModule {}
