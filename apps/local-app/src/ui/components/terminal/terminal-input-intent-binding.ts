import type { Terminal } from '@xterm/xterm';

const DOM_INPUT_INTENT_EVENTS = ['paste', 'compositionstart', 'beforeinput'] as const;

export interface TerminalInputIntentBindingOptions {
  terminal: Pick<Terminal, 'onKey'>;
  container: HTMLElement;
  onInputIntent: () => void;
}

export interface TerminalInputIntentBinding {
  dispose(): void;
}

/**
 * Observes browser-backed text input before xterm publishes the related `onData` event.
 * `onData` is deliberately absent because it also carries terminal protocol replies.
 */
export function createTerminalInputIntentBinding(
  options: TerminalInputIntentBindingOptions,
): TerminalInputIntentBinding {
  const { terminal, container, onInputIntent } = options;
  const capture = { capture: true, passive: true } as const;
  const handleDomInputIntent = () => onInputIntent();
  const keyDisposable = terminal.onKey(onInputIntent);

  for (const eventName of DOM_INPUT_INTENT_EVENTS) {
    container.addEventListener(eventName, handleDomInputIntent, capture);
  }

  return {
    dispose() {
      keyDisposable.dispose();
      for (const eventName of DOM_INPUT_INTENT_EVENTS) {
        container.removeEventListener(eventName, handleDomInputIntent, capture);
      }
    },
  };
}
