export interface SessionTerminalRuntimeDescriptor {
  readonly sessionId: string;
  readonly tmuxSessionName: string | null;
  readonly normalizeLf: boolean;
  readonly usesAlternateScreen: boolean;
}

export interface SessionTerminalStartupEntry {
  readonly sessionId: string;
  readonly tmuxSessionName: string;
}
