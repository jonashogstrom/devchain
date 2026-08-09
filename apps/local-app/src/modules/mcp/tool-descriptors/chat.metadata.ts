import { SendMessageParamsSchema, PROJECT_ID_PREFIX_PATTERN } from '../dtos/mcp.dto';
import type { ToolMetadataEntry } from './types';

export const chatMetadata: ToolMetadataEntry[] = [
  {
    name: 'devchain_send_message',
    description:
      'Send a terminal-routed message. Sender is derived from session agent. Provide recipientProjectId for Project Owner delivery, recipientAgentNames for one or more explicit recipients, or teamName for team routing. Omit all recipient fields to fan out to your own team (resolved from session).',
    inputSchema: {
      type: 'object',
      required: ['sessionId', 'message'],
      properties: {
        sessionId: {
          type: 'string',
          description: 'Session ID (full UUID or 8+ char prefix)',
        },
        recipientAgentNames: {
          type: 'array',
          items: { type: 'string' },
          minItems: 1,
          description:
            'Agent names (case-insensitive) for pooled terminal delivery. Accepts one or more recipients.',
        },
        teamName: {
          type: 'string',
          description:
            'Team name (case-insensitive). Routes to team lead if assigned, otherwise to all members. Mutually exclusive with recipientAgentNames. Omit all recipient fields to fan out to your own team (resolved from session).',
        },
        recipientProjectId: {
          type: 'string',
          pattern: PROJECT_ID_PREFIX_PATTERN.source,
          description:
            'Full project UUID or valid 8+ character UUID prefix. Mutually exclusive with agent and team routing.',
        },
        message: { type: 'string', description: 'Message content to deliver.' },
      },
      additionalProperties: false,
    },
    paramsSchema: SendMessageParamsSchema,
  },
];
