import { Module } from '@nestjs/common';
import { TerminalModule } from './terminal.module';
import { ProcessExecutorModule } from './services/process-executor/process-executor.module';
import { TerminalViewportFacade } from './services/terminal-viewport/terminal-viewport.facade';

/**
 * NARROW facade module for the live viewport. Imports `TerminalModule` (for
 * `TerminalSessionRegistry`) and `ProcessExecutorModule` (for the tmux capture executor),
 * but exports ONLY {@link TerminalViewportFacade}.
 *
 * `CloudTunnelModule` imports THIS module — not `TerminalModule` wholesale — to keep its
 * terminal dependency limited to the read-only viewport capability.
 */
@Module({
  imports: [TerminalModule, ProcessExecutorModule],
  providers: [TerminalViewportFacade],
  exports: [TerminalViewportFacade],
})
export class TerminalViewportModule {}
