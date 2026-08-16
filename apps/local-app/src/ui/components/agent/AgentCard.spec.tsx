import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AgentCard } from './AgentCard';
import type {
  AgentCardProps,
  AgentCardData,
  AgentCardProfile,
  AgentCardProvider,
} from './AgentCard';

const baseProfile: AgentCardProfile = {
  id: 'profile-1',
  name: 'Default Profile',
  providerId: 'provider-1',
  provider: { id: 'provider-1', name: 'claude' },
  promptCount: 3,
};

const baseProvider: AgentCardProvider = {
  id: 'provider-1',
  name: 'claude',
};

const baseAgent: AgentCardData = {
  id: 'agent-1',
  projectId: 'project-1',
  profileId: 'profile-1',
  name: 'Agent One',
  isProjectOwner: false,
  description: 'A test agent description',
  profile: baseProfile,
  createdAt: '2024-06-15T00:00:00.000Z',
  updatedAt: '2024-06-15T00:00:00.000Z',
};

const providersById = new Map<string, AgentCardProvider>([['provider-1', baseProvider]]);

function buildProps(overrides?: Partial<AgentCardProps>): AgentCardProps {
  return {
    agent: baseAgent,
    profile: baseProfile,
    providerName: 'claude',
    providersById,
    isUpdating: false,
    isDeleting: false,
    onEdit: jest.fn(),
    onDelete: jest.fn(),
    ...overrides,
  };
}

describe('AgentCard', () => {
  it('renders agent name, profile, description, and created date', () => {
    render(<AgentCard {...buildProps()} />);

    expect(screen.getByText('Agent One')).toBeInTheDocument();
    expect(screen.getByText('Default Profile')).toBeInTheDocument();
    expect(screen.getByText('A test agent description')).toBeInTheDocument();
    expect(screen.getByText(/6\/15\/2024/)).toBeInTheDocument();
  });

  it('renders data-testid with agent id', () => {
    render(<AgentCard {...buildProps()} />);

    expect(screen.getByTestId('agent-card-agent-1')).toBeInTheDocument();
  });

  it('shows "Unnamed agent" when agent name is empty', () => {
    render(<AgentCard {...buildProps({ agent: { ...baseAgent, name: '' } })} />);

    expect(screen.getByText('Unnamed agent')).toBeInTheDocument();
  });

  it('shows "Unknown Profile" when profile is undefined', () => {
    render(<AgentCard {...buildProps({ profile: undefined })} />);

    expect(screen.getByText('Unknown Profile')).toBeInTheDocument();
  });

  it('shows an accessible Project owner badge for the owner agent', () => {
    render(<AgentCard {...buildProps({ agent: { ...baseAgent, isProjectOwner: true } })} />);

    expect(screen.getByText('Project owner')).toBeInTheDocument();
    expect(screen.getByLabelText('Project owner')).toHaveTextContent('Project owner');
  });

  it('does not show a Project owner badge for ordinary agents', () => {
    render(<AgentCard {...buildProps()} />);

    expect(screen.queryByText('Project owner')).not.toBeInTheDocument();
  });

  it('shows provider name badge', () => {
    render(<AgentCard {...buildProps({ providerName: 'claude' })} />);

    expect(screen.getByText('CLAUDE')).toBeInTheDocument();
  });

  it('shows prompt count badge', () => {
    render(<AgentCard {...buildProps()} />);

    expect(screen.getByText('3 prompts')).toBeInTheDocument();
  });

  it('shows singular "prompt" for count of 1', () => {
    render(<AgentCard {...buildProps({ profile: { ...baseProfile, promptCount: 1 } })} />);

    expect(screen.getByText('1 prompt')).toBeInTheDocument();
  });

  it('shows provider config badge when agent has providerConfig', () => {
    const agentWithConfig: AgentCardData = {
      ...baseAgent,
      providerConfig: {
        id: 'config-1',
        profileId: 'profile-1',
        providerId: 'provider-1',
        name: 'default',
        options: null,
        env: null,
      },
    };
    render(<AgentCard {...buildProps({ agent: agentWithConfig })} />);

    expect(screen.getByText('default')).toBeInTheDocument();
  });

  it('shows [env] suffix on provider config badge when env is set', () => {
    const agentWithConfig: AgentCardData = {
      ...baseAgent,
      providerConfig: {
        id: 'config-1',
        profileId: 'profile-1',
        providerId: 'provider-1',
        name: 'custom-config',
        options: null,
        env: { API_KEY: 'xxx' },
      },
    };
    render(<AgentCard {...buildProps({ agent: agentWithConfig })} />);

    expect(screen.getByText('custom-config [env]')).toBeInTheDocument();
  });

  // ---- Session lifecycle controls are Chat-only ----

  it('renders no session lifecycle controls or last-launched badge', () => {
    render(<AgentCard {...buildProps()} />);

    expect(screen.queryByRole('button', { name: /launch session/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /restart session/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /terminate session/i })).not.toBeInTheDocument();
    expect(screen.queryByText('Last launched')).not.toBeInTheDocument();
  });

  // ---- Edit and Delete ----

  it('calls onEdit with agent data when Edit clicked', async () => {
    const user = userEvent.setup();
    const onEdit = jest.fn();
    render(<AgentCard {...buildProps({ onEdit })} />);

    await user.click(screen.getByRole('button', { name: /edit/i }));

    expect(onEdit).toHaveBeenCalledWith(baseAgent);
  });

  it('disables Edit button when isUpdating is true', () => {
    render(<AgentCard {...buildProps({ isUpdating: true })} />);

    expect(screen.getByRole('button', { name: /edit/i })).toBeDisabled();
  });

  it('calls onDelete with agent data when Delete clicked', async () => {
    const user = userEvent.setup();
    const onDelete = jest.fn();
    render(<AgentCard {...buildProps({ onDelete })} />);

    await user.click(screen.getByRole('button', { name: /delete/i }));

    expect(onDelete).toHaveBeenCalledWith(baseAgent);
  });

  it('disables Delete button when isDeleting is true', () => {
    render(<AgentCard {...buildProps({ isDeleting: true })} />);

    expect(screen.getByRole('button', { name: /delete/i })).toBeDisabled();
  });

  // ---- ARIA / Accessibility ----

  it('renders accessible avatar with aria-label', () => {
    render(<AgentCard {...buildProps()} />);

    const avatars = screen.getAllByRole('img', { name: /avatar for agent agent one/i });
    expect(avatars.length).toBeGreaterThanOrEqual(1);
  });
});
