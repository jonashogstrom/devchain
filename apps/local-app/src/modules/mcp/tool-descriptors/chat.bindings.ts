import type { ToolBindingEntry } from './types';
import { handleSendMessage } from '../services/handlers/chat-tools';

export const chatBindings: ToolBindingEntry[] = [
  ['devchain_send_message', handleSendMessage as unknown as ToolBindingEntry[1]],
];
