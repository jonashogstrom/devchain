import type { RefCallback } from 'react';

export type AgentEventBusDeliveryStatus = 'queued' | 'delivered' | 'failed' | 'unconfirmed';

export interface AgentEventBusAnchorDescriptor {
  key: string;
  agentId: string;
  teamId?: string;
}

export interface AgentEventBusAnchor extends AgentEventBusAnchorDescriptor {
  x: number;
  y: number;
  order: number;
}

export interface AgentEventBusRuntimeOrigin {
  kind: 'runtime';
  x: number;
  y: number;
}

export interface AgentEventBusProjectBoundary {
  kind: 'project-boundary';
  key: 'project-boundary';
  x: number;
  y: number;
}

export interface AgentEventBusGeometrySnapshot {
  scopeEpoch: number;
  geometryEpoch: number;
  width: number;
  height: number;
  busX: number;
  runtimeOrigin: AgentEventBusRuntimeOrigin;
  anchors: AgentEventBusAnchor[];
}

export type AgentEventBusAgentEndpoint = AgentEventBusAnchor & { kind: 'agent' };

export type AgentEventBusPathSource =
  | AgentEventBusAgentEndpoint
  | AgentEventBusRuntimeOrigin
  | AgentEventBusProjectBoundary;

export type AgentEventBusPathRecipient = AgentEventBusAgentEndpoint | AgentEventBusProjectBoundary;

export interface AgentEventBusPath {
  d: string;
  length: number;
  durationMs: number;
  radius: number;
  source: AgentEventBusPathSource;
  recipient: AgentEventBusPathRecipient;
}

export type AgentEventBusRouteFeedback =
  | { kind: 'delivery'; status: AgentEventBusDeliveryStatus }
  | { kind: 'runtime-started' };

/**
 * What the pulse represents. Deliberately independent of `source.kind`: an epic can be
 * assigned by an agent or by the system, so topology cannot stand in for identity the way
 * it did when messages and session starts were the only two kinds.
 */
export type AgentEventBusEventKind = 'agent-message' | 'session-started' | 'epic-assigned';

interface AgentEventBusActiveRouteBase {
  id: string;
  frameId: string;
  generation: number;
  eventKind: AgentEventBusEventKind;
  mode: 'traveling' | 'arrived' | 'static';
  path: AgentEventBusPath;
}

export type AgentEventBusActiveRoute = AgentEventBusActiveRouteBase &
  (
    | {
        routeKind: 'agent-to-agent';
        source: { kind: 'agent'; senderAgentId: string };
        recipient: { kind: 'agent'; agentId: string };
        recipientAgentId: string;
        feedback: { kind: 'delivery'; status: AgentEventBusDeliveryStatus };
        teamId?: string;
      }
    | {
        routeKind: 'runtime-ingress';
        source: { kind: 'runtime' };
        recipient: { kind: 'agent'; agentId: string };
        recipientAgentId: string;
        feedback: { kind: 'runtime-started' };
        runtimeOrdinal: number;
      }
    | {
        routeKind: 'project-egress';
        source: { kind: 'agent'; senderAgentId: string };
        recipient: { kind: 'project-boundary' };
        feedback: { kind: 'delivery'; status: AgentEventBusDeliveryStatus };
        projectDirection: 'outbound';
      }
    | {
        routeKind: 'project-ingress';
        source: { kind: 'project-boundary' };
        recipient: { kind: 'agent'; agentId: string };
        recipientAgentId: string;
        feedback: { kind: 'delivery'; status: AgentEventBusDeliveryStatus };
        projectDirection: 'inbound';
      }
  );

export interface AgentEventBusLayoutApi {
  getAnchorRef: (descriptor: AgentEventBusAnchorDescriptor) => RefCallback<HTMLElement>;
  refreshRegistrationOrder: () => void;
}

export interface AgentEventBusAnimationHandle {
  cancel: () => void;
}

export interface AgentEventBusAnimationDriver {
  animate: (
    element: Element,
    keyframes: Keyframe[],
    options: KeyframeAnimationOptions,
  ) => AgentEventBusAnimationHandle;
}
