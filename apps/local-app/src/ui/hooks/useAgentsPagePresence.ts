import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useFetchFactory } from '@/ui/hooks/useFetchFactory';
import { useRealtimeDispatch } from '@/ui/hooks/useRealtimeDispatch';
import type { RealtimeInvalidationRegistry } from '@/ui/lib/realtime-invalidation-registry';
import { fetchAgentPresence, type AgentPresenceMap } from '@/ui/lib/sessions';

export interface UseAgentsPagePresenceOptions {
  projectId: string | null;
}

export function useAgentsPagePresence({
  projectId,
}: UseAgentsPagePresenceOptions): AgentPresenceMap {
  const apiFetch = useFetchFactory();

  // ---- Presence query ----
  const { data: agentPresence = {} as AgentPresenceMap } = useQuery({
    queryKey: ['agent-presence', projectId],
    queryFn: () => fetchAgentPresence(projectId as string, apiFetch),
    enabled: !!projectId,
    refetchInterval: 2000,
  });

  // ---- Realtime presence via socket ----
  const presenceRegistry: RealtimeInvalidationRegistry = useMemo(() => {
    const entries: RealtimeInvalidationRegistry[number]['entries'] = [
      { kind: 'invalidate', queryKey: ['agent-presence'] },
      ...(projectId
        ? [{ kind: 'invalidate' as const, queryKey: ['agent-presence', projectId] }]
        : []),
    ];

    return [
      {
        match: (topic) => topic.startsWith('agent/'),
        type: 'presence',
        entries,
      },
      {
        match: (topic) => topic.startsWith('session/'),
        type: 'activity',
        entries,
      },
    ];
  }, [projectId]);
  useRealtimeDispatch(presenceRegistry);

  return agentPresence;
}
