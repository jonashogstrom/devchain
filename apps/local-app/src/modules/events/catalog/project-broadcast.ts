import type { BroadcastTopicEntry } from './broadcast-metadata';

export interface ProjectedBroadcast {
  topic: string;
  type: string;
  payload: unknown;
}

/**
 * Apply a single broadcast-registry entry's projection to a raw event payload.
 *
 * SINGLE source of truth for the event→{topic,type,payload} mapping, shared by the
 * socket.io `CatalogBroadcasterService` and the tunnel `TunnelEventForwarderService`
 * so the two transports can never drift in how an event is projected. Per
 * The canonical architecture keeps catalog projection in events infrastructure; this only
 * factors the per-entry application out of `CatalogBroadcasterService` (behaviour
 * is identical) so a second transport can reuse it instead of reimplementing it.
 */
export function projectBroadcast(
  entry: BroadcastTopicEntry<Record<string, unknown>>,
  payload: Record<string, unknown>,
): ProjectedBroadcast {
  const topic = typeof entry.topic === 'function' ? entry.topic(payload) : entry.topic;
  const type = typeof entry.type === 'function' ? entry.type(payload) : entry.type;
  const projected = entry.payloadProjection ? entry.payloadProjection(payload) : payload;
  return { topic, type, payload: projected };
}
