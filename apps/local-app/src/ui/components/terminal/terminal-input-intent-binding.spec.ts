import type { Terminal } from '@xterm/xterm';
import { createTerminalInputIntentBinding } from './terminal-input-intent-binding';

describe('createTerminalInputIntentBinding', () => {
  function createFixture() {
    const container = document.createElement('div');
    const child = document.createElement('textarea');
    container.appendChild(child);
    document.body.appendChild(container);

    let onKey: (() => void) | undefined;
    const keyDisposable = { dispose: jest.fn() };
    const terminal = {
      onKey: jest.fn((listener: () => void) => {
        onKey = listener;
        return keyDisposable;
      }),
    } as unknown as Pick<Terminal, 'onKey'>;
    const onInputIntent = jest.fn();
    const binding = createTerminalInputIntentBinding({ terminal, container, onInputIntent });

    return { binding, child, keyDisposable, onInputIntent, triggerKey: () => onKey?.() };
  }

  afterEach(() => {
    document.body.replaceChildren();
  });

  it('routes xterm onKey and capture-phase DOM text gestures to one callback', () => {
    const { child, onInputIntent, triggerKey } = createFixture();

    triggerKey();
    child.dispatchEvent(new Event('paste', { bubbles: true }));
    child.dispatchEvent(new Event('compositionstart', { bubbles: true }));
    child.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, inputType: 'insertText' }));

    expect(onInputIntent).toHaveBeenCalledTimes(4);
  });

  it('observes DOM intent during capture before descendant input handlers', () => {
    const { child, onInputIntent } = createFixture();
    const order: string[] = [];
    onInputIntent.mockImplementation(() => order.push('intent'));
    child.addEventListener('beforeinput', () => order.push('descendant'));

    child.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, inputType: 'insertText' }));

    expect(order).toEqual(['intent', 'descendant']);
  });

  it('disposes the onKey subscription and every DOM listener', () => {
    const { binding, child, keyDisposable, onInputIntent } = createFixture();

    binding.dispose();
    child.dispatchEvent(new Event('paste', { bubbles: true }));
    child.dispatchEvent(new Event('compositionstart', { bubbles: true }));
    child.dispatchEvent(new InputEvent('beforeinput', { bubbles: true }));

    expect(keyDisposable.dispose).toHaveBeenCalledTimes(1);
    expect(onInputIntent).not.toHaveBeenCalled();
  });
});
