import type { UnifiedMessage } from '../dtos/unified-session.types';
import type { UnifiedChunk, UnifiedSemanticStep, UnifiedTurn } from '../dtos/unified-chunk.types';

type RpcTranscriptTailSource =
  | { kind: 'full-refetch-required' }
  | {
      kind: 'delta';
      deltaChunks: UnifiedChunk[];
      deltaMessages: UnifiedMessage[];
    };

export function serializeMessage(message: UnifiedMessage): Record<string, unknown> {
  return {
    ...message,
    timestamp: message.timestamp.toISOString(),
  };
}

function serializeSemanticStep(step: UnifiedSemanticStep): Record<string, unknown> {
  return {
    ...step,
    startTime: step.startTime.toISOString(),
  };
}

function serializeTurn(turn: UnifiedTurn): Record<string, unknown> {
  return {
    ...turn,
    timestamp: turn.timestamp.toISOString(),
    steps: turn.steps.map(serializeSemanticStep),
  };
}

export function serializeChunk(chunk: UnifiedChunk): Record<string, unknown> {
  const base: Record<string, unknown> = {
    id: chunk.id,
    type: chunk.type,
    startTime: chunk.startTime.toISOString(),
    endTime: chunk.endTime.toISOString(),
    messages: chunk.messages.map(serializeMessage),
    metrics: chunk.metrics,
  };

  if (chunk.type === 'ai' && 'semanticSteps' in chunk) {
    base.semanticSteps = chunk.semanticSteps.map(serializeSemanticStep);
  }

  return base;
}

/**
 * RPC transcript results preserve the raw chunk's additive wire-compatible fields and the
 * deprecated turns consumed by older clients. REST and push continue using serializeChunk's
 * narrower projection.
 */
export function serializeRpcChunk(chunk: UnifiedChunk): Record<string, unknown> {
  const serialized = {
    ...chunk,
    ...serializeChunk(chunk),
  };

  if (chunk.type === 'ai') {
    return {
      ...serialized,
      turns: chunk.turns.map(serializeTurn),
    };
  }

  return serialized;
}

export function serializeRpcTranscriptChunks(response: {
  chunks: UnifiedChunk[];
}): Record<string, unknown> {
  return {
    ...response,
    chunks: response.chunks.map(serializeRpcChunk),
  };
}

export function serializeRpcTranscriptTail(
  response: RpcTranscriptTailSource | null,
): Record<string, unknown> | null {
  if (response === null) {
    return response;
  }
  if (response.kind === 'full-refetch-required') return { ...response };

  return {
    ...response,
    deltaChunks: response.deltaChunks.map(serializeRpcChunk),
    deltaMessages: response.deltaMessages.map(serializeMessage),
  };
}
