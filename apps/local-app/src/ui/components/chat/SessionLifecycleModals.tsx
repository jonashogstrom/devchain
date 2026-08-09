import { Button } from '@/ui/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/ui/components/ui/dialog';
import { Loader2 } from 'lucide-react';
import { McpConfigurationModal } from '@/ui/components/shared/McpConfigurationModal';
import type { AgentOrGuest, PendingLaunchAgent } from '@/ui/hooks/useChatQueries';

interface SessionLifecycleModalsProps {
  terminateConfirm: { agentId: string; sessionId: string } | null;
  setTerminateConfirm: (confirm: { agentId: string; sessionId: string } | null) => void;
  terminateAllConfirm: boolean;
  setTerminateAllConfirm: (confirm: boolean) => void;
  mcpModalOpen: boolean;
  setMcpModalOpen: (open: boolean) => void;
  agentsWithSessions: AgentOrGuest[];
  pendingLaunchAgent: PendingLaunchAgent | null;
  setPendingLaunchAgent: (agent: PendingLaunchAgent | null) => void;
  projectRootPath?: string;
  hasSelectedProject: boolean;
  onTerminateSession: (agentId: string, sessionId: string) => Promise<void>;
  onTerminateAllAgents: () => Promise<void>;
  onMcpConfigured: () => Promise<void>;
  onVerifyMcp: () => Promise<boolean>;
  launchingAgentIds: Record<string, boolean>;
  terminatingAll: boolean;
}

export function SessionLifecycleModals({
  terminateConfirm,
  setTerminateConfirm,
  terminateAllConfirm,
  setTerminateAllConfirm,
  mcpModalOpen,
  setMcpModalOpen,
  agentsWithSessions,
  pendingLaunchAgent,
  setPendingLaunchAgent,
  projectRootPath,
  hasSelectedProject,
  onTerminateSession,
  onTerminateAllAgents,
  onMcpConfigured,
  onVerifyMcp,
  launchingAgentIds,
  terminatingAll,
}: SessionLifecycleModalsProps) {
  return (
    <>
      <Dialog
        open={Boolean(terminateConfirm)}
        onOpenChange={(open) => {
          if (!open) setTerminateConfirm(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Terminate session?</DialogTitle>
            <DialogDescription>
              This will stop the agent&apos;s current session. You can launch again afterward.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTerminateConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (terminateConfirm) {
                  void onTerminateSession(terminateConfirm.agentId, terminateConfirm.sessionId);
                }
              }}
              disabled={
                !terminateConfirm ||
                Boolean(launchingAgentIds[terminateConfirm.agentId]) ||
                !hasSelectedProject
              }
            >
              {terminateConfirm && launchingAgentIds[terminateConfirm.agentId] ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Terminating...
                </>
              ) : (
                'Terminate'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={terminateAllConfirm} onOpenChange={setTerminateAllConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Terminate all sessions?</DialogTitle>
            <DialogDescription>
              This will stop all {agentsWithSessions.length} running agent session
              {agentsWithSessions.length !== 1 ? 's' : ''}. You can launch them again afterward.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setTerminateAllConfirm(false)}
              disabled={terminatingAll}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={onTerminateAllAgents}
              disabled={terminatingAll || agentsWithSessions.length === 0}
            >
              {terminatingAll ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Terminating...
                </>
              ) : (
                'Terminate All'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {pendingLaunchAgent && (
        <McpConfigurationModal
          open={mcpModalOpen}
          onOpenChange={(open) => {
            setMcpModalOpen(open);
            if (!open) {
              setPendingLaunchAgent(null);
            }
          }}
          providerId={pendingLaunchAgent.providerId}
          providerName={pendingLaunchAgent.providerName}
          projectPath={projectRootPath}
          onConfigured={onMcpConfigured}
          onVerify={onVerifyMcp}
        />
      )}
    </>
  );
}
