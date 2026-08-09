import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { AgentPresenceMap } from '@/ui/lib/sessions';
import { compareCanonicalAgents } from '@/ui/lib/agent-ordering';
import type { AgentOrGuest } from './useChatQueries';

export interface InlineTerminalEntry {
  agentId: string;
  sessionId: string | null;
}

export interface UseAgentConsoleUiStateOptions {
  projectId: string | null;
  agentPresence: AgentPresenceMap;
  agents: AgentOrGuest[];
  agentsQuerySuccess: boolean;
}

export interface UseAgentConsoleUiStateResult {
  selectedAgentId: string | null;
  selectedAgent: AgentOrGuest | null;
  handleSelectAgent: (agentId: string | null, options?: { replace?: boolean }) => void;
  attachInlineTerminalForAgent: (agentId: string, sessionId: string | null) => boolean;
  inlineTerminalState: InlineTerminalEntry | null;
  showInlineTerminal: boolean;
  inlineTerminalSessionId: string | null;
}

export function useAgentConsoleUiState({
  projectId,
  agentPresence,
  agents,
  agentsQuerySuccess,
}: UseAgentConsoleUiStateOptions): UseAgentConsoleUiStateResult {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedAgentId = searchParams.get('agent') || null;
  const previousProjectIdRef = useRef<string | null>(null);
  const [inlineTerminalsByAgent, setInlineTerminalsByAgent] = useState<
    Record<string, InlineTerminalEntry>
  >({});

  const handleSelectAgent = useCallback(
    (agentId: string | null, { replace = false }: { replace?: boolean } = {}) => {
      const params = new URLSearchParams(searchParams);
      const currentAgentId = params.get('agent');
      const target = agentId || null;

      if ((target && currentAgentId === target) || (!target && !currentAgentId)) {
        return;
      }

      if (target) {
        params.set('agent', target);
      } else {
        params.delete('agent');
      }
      setSearchParams(params, { replace });
    },
    [searchParams, setSearchParams],
  );

  const canonicalAgents = useMemo(() => [...agents].sort(compareCanonicalAgents), [agents]);

  useEffect(() => {
    if (!projectId || !agentsQuerySuccess) {
      return;
    }

    const validSelection = canonicalAgents.some((agent) => agent.id === selectedAgentId);
    const nextAgentId = validSelection ? selectedAgentId : (canonicalAgents[0]?.id ?? null);
    if (nextAgentId !== selectedAgentId) {
      handleSelectAgent(nextAgentId, { replace: true });
    }
  }, [agentsQuerySuccess, canonicalAgents, handleSelectAgent, projectId, selectedAgentId]);

  const selectedAgent = useMemo(
    () => agents.find((agent) => agent.id === selectedAgentId) ?? null,
    [agents, selectedAgentId],
  );
  const selectedPresence = selectedAgentId ? agentPresence[selectedAgentId] : undefined;
  const inlineTerminalState = selectedAgentId
    ? (inlineTerminalsByAgent[selectedAgentId] ?? {
        agentId: selectedAgentId,
        sessionId: selectedPresence?.online ? (selectedPresence.sessionId ?? null) : null,
      })
    : null;
  const showInlineTerminal = Boolean(inlineTerminalState);
  const inlineTerminalSessionId = inlineTerminalState?.sessionId ?? null;

  const attachInlineTerminalForAgent = useCallback(
    (agentId: string, sessionId: string | null): boolean => {
      if (selectedAgentId !== agentId) {
        console.warn('Rejected inline terminal bind: agent is not selected', {
          agentId,
          selectedAgentId,
        });
        return false;
      }

      setInlineTerminalsByAgent((previous) => ({
        ...previous,
        [agentId]: { agentId, sessionId },
      }));
      return true;
    },
    [selectedAgentId],
  );

  useEffect(() => {
    setInlineTerminalsByAgent((previous) => {
      let changed = false;
      const next = { ...previous };
      for (const [agentId, entry] of Object.entries(previous)) {
        const presence = agentPresence[entry.agentId];
        const sessionId = presence?.online ? (presence.sessionId ?? null) : null;
        if (sessionId !== entry.sessionId) {
          next[agentId] = { ...entry, sessionId };
          changed = true;
        }
      }
      return changed ? next : previous;
    });
  }, [agentPresence]);

  useEffect(() => {
    if (!selectedAgentId) {
      return;
    }

    const presence = agentPresence[selectedAgentId];
    const sessionId = presence?.online ? (presence.sessionId ?? null) : null;
    setInlineTerminalsByAgent((previous) => {
      if (previous[selectedAgentId]) {
        return previous;
      }

      return {
        ...previous,
        [selectedAgentId]: { agentId: selectedAgentId, sessionId },
      };
    });
  }, [selectedAgentId, agentPresence]);

  useEffect(() => {
    const previousProjectId = previousProjectIdRef.current;
    if (previousProjectId === projectId) {
      return;
    }

    previousProjectIdRef.current = projectId;
    if (previousProjectId !== null) {
      setInlineTerminalsByAgent({});
    }
  }, [projectId]);

  return {
    selectedAgentId,
    selectedAgent,
    handleSelectAgent,
    attachInlineTerminalForAgent,
    inlineTerminalState,
    showInlineTerminal,
    inlineTerminalSessionId,
  };
}
