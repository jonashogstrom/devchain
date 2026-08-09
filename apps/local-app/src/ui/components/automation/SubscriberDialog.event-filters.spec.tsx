// Test layer: UI component/jsdom. Rendering SubscriberDialog with network-boundary mocks is the
// cheapest reliable layer for proving hydration, accessible interactions, row validation, and
// serialized payloads without exercising backend I/O.
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SubscriberDialog } from './SubscriberDialog';
import type { ActionMetadata } from '@/ui/lib/actions';
import type { Subscriber } from '@/ui/lib/subscribers';

const toastSpy = jest.fn();

jest.mock('@/ui/hooks/use-toast', () => ({
  useToast: () => ({ toast: toastSpy }),
}));

jest.mock('@/ui/hooks/useProjectSelection', () => ({
  useSelectedProject: () => ({
    selectedProjectId: 'proj-1',
  }),
}));

const action: ActionMetadata = {
  type: 'send_message',
  name: 'Send Message',
  description: 'Send a message',
  category: 'notification',
  inputs: [],
};

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    json: async () => body,
  } as Response;
}

function makeSubscriber(overrides: Partial<Subscriber> = {}): Subscriber {
  return {
    id: 'sub-1',
    projectId: 'proj-1',
    name: 'Subscriber',
    description: null,
    enabled: true,
    eventName: 'terminal.watcher.triggered',
    eventFilter: null,
    actionType: action.type,
    actionInputs: {},
    delayMs: 0,
    cooldownMs: 5000,
    retryOnError: false,
    groupName: null,
    position: 0,
    priority: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

interface CapturedRequest {
  body: Record<string, unknown> | null;
}

function installApiMock(subscriber: Subscriber): CapturedRequest {
  const captured: CapturedRequest = { body: null };
  const fetchMock = jest.fn(
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = String(input);

      if (url === '/api/subscribers/events') {
        return jsonResponse({
          events: [
            {
              name: 'terminal.watcher.triggered',
              label: 'Terminal Watcher Triggered',
              description: '',
              category: 'terminal',
              fields: [],
            },
          ],
        });
      }

      if (url === '/api/actions') {
        return jsonResponse([action]);
      }

      if (url.startsWith('/api/watchers?')) {
        return jsonResponse([]);
      }

      if (url === '/api/subscribers/sub-1' && init?.method === 'PUT') {
        const body = JSON.parse(String(init.body ?? '{}')) as Record<string, unknown>;
        captured.body = body;
        return jsonResponse(subscriber);
      }

      if (url === '/api/subscribers' && init?.method === 'POST') {
        const body = JSON.parse(String(init.body ?? '{}')) as Record<string, unknown>;
        captured.body = body;
        return jsonResponse({ ...subscriber, id: 'sub-created' });
      }

      return jsonResponse({});
    },
  );
  globalThis.fetch = fetchMock;
  return captured;
}

function setFilterRow(index: number, field: string, value: string): void {
  fireEvent.change(screen.getAllByPlaceholderText('sessionId')[index], {
    target: { value: field },
  });
  fireEvent.change(screen.getAllByPlaceholderText('value')[index], {
    target: { value },
  });
}

function renderWithQuery(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

function renderEditDialog(subscriber: Subscriber) {
  return renderWithQuery(
    <SubscriberDialog open={true} onOpenChange={jest.fn()} subscriber={subscriber} />,
  );
}

function renderCreateDialog() {
  return renderWithQuery(<SubscriberDialog open={true} onOpenChange={jest.fn()} />);
}

describe('SubscriberDialog - event filters', () => {
  beforeEach(() => {
    toastSpy.mockReset();
    // Radix UI uses ResizeObserver via @radix-ui/react-use-size; jsdom does not provide it.
    if (!globalThis.ResizeObserver) {
      globalThis.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
      };
    }
  });

  it('exposes add/remove controls and submits null when no filter rows remain', async () => {
    const subscriber = makeSubscriber();
    const captured = installApiMock(subscriber);

    renderEditDialog(subscriber);

    await screen.findByDisplayValue('Subscriber');
    const addButton = await screen.findByRole('button', { name: 'Add event filter' });
    fireEvent.click(addButton);
    expect(screen.getByLabelText('Field')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove filter 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add another filter' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Remove filter 1' }));
    expect(screen.getByRole('button', { name: 'Add event filter' })).toBeInTheDocument();

    await screen.findByRole('combobox', { name: 'Action type' });
    expect(screen.getByPlaceholderText('Or enter custom event name...')).toHaveValue(
      'terminal.watcher.triggered',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Update' }));

    await waitFor(() => expect(captured.body).not.toBeNull());
    expect(captured.body).toEqual(expect.objectContaining({ eventFilter: null }));
  });

  it('hydrates a legacy leaf and serializes one row as a canonical AND group', async () => {
    const subscriber = makeSubscriber({
      eventFilter: { field: 'sessionId', operator: 'contains', value: 'abc' },
    });
    const captured = installApiMock(subscriber);

    renderEditDialog(subscriber);

    expect(await screen.findByDisplayValue('sessionId')).toBeInTheDocument();
    expect(screen.getByDisplayValue('abc')).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Filter combination' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Update' }));

    await waitFor(() => expect(captured.body).not.toBeNull());
    expect(captured.body).toEqual(
      expect.objectContaining({
        eventFilter: {
          combinator: 'and',
          filters: [{ field: 'sessionId', operator: 'contains', value: 'abc' }],
        },
      }),
    );
    expect(JSON.stringify(captured.body)).not.toContain('event-filter-row');
  });

  it('hydrates groups, preserves row contents when changing match mode, and supports add/remove', async () => {
    const subscriber = makeSubscriber({
      eventFilter: {
        combinator: 'or',
        filters: [
          { field: 'sessionId', operator: 'equals', value: 'session-1' },
          { field: 'agentName', operator: 'contains', value: 'Coder' },
        ],
      },
    });
    const captured = installApiMock(subscriber);

    renderEditDialog(subscriber);

    expect(await screen.findByDisplayValue('sessionId')).toBeInTheDocument();
    expect(screen.getByDisplayValue('agentName')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Filter combination' })).toHaveTextContent(
      'Match any',
    );

    fireEvent.click(screen.getByRole('combobox', { name: 'Filter combination' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Match all' }));
    expect(screen.getByDisplayValue('session-1')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Coder')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Add another filter' }));
    setFilterRow(2, 'eventName', 'terminal.started');
    expect(screen.getByRole('button', { name: 'Remove filter 3' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Remove filter 3' }));
    expect(screen.queryByDisplayValue('terminal.started')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Update' }));

    await waitFor(() => expect(captured.body).not.toBeNull());
    expect(captured.body).toEqual(
      expect.objectContaining({
        eventFilter: {
          combinator: 'and',
          filters: [
            { field: 'sessionId', operator: 'equals', value: 'session-1' },
            { field: 'agentName', operator: 'contains', value: 'Coder' },
          ],
        },
      }),
    );
    expect(JSON.stringify(captured.body)).not.toContain('event-filter-row');
  });

  it('keeps validation errors attached to the remaining row after removal', async () => {
    const subscriber = makeSubscriber();
    installApiMock(subscriber);

    renderEditDialog(subscriber);
    fireEvent.click(await screen.findByRole('button', { name: 'Add event filter' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add another filter' }));

    setFilterRow(0, 'sessionId', 'session-1');

    fireEvent.click(screen.getByRole('button', { name: 'Update' }));
    await waitFor(() => {
      expect(screen.getAllByText('Filter field is required')).toHaveLength(1);
      expect(screen.getAllByText('Filter value is required')).toHaveLength(1);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Remove filter 1' }));
    expect(screen.getAllByPlaceholderText('sessionId')).toHaveLength(1);
    expect(screen.getAllByText('Filter field is required')).toHaveLength(1);
    expect(screen.getAllByText('Filter value is required')).toHaveLength(1);
  });

  it('submits a create payload with a compound group and no UI-only row identifiers', async () => {
    const subscriber = makeSubscriber();
    const captured = installApiMock(subscriber);

    renderCreateDialog();
    await screen.findByRole('combobox', { name: 'Action type' });
    fireEvent.change(screen.getByPlaceholderText('Error Handler'), {
      target: { value: 'Compound subscriber' },
    });
    fireEvent.change(screen.getByPlaceholderText('Or enter custom event name...'), {
      target: { value: 'terminal.watcher.triggered' },
    });

    fireEvent.click(await screen.findByRole('combobox', { name: 'Action type' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Send Message' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add event filter' }));

    setFilterRow(0, 'sessionId', 'session-1');
    fireEvent.click(screen.getByRole('button', { name: 'Add another filter' }));
    setFilterRow(1, 'agentName', 'Coder');

    const combination = screen.getByRole('combobox', { name: 'Filter combination' });
    expect(combination).toHaveTextContent('Match all');
    fireEvent.click(combination);
    fireEvent.click(await screen.findByRole('option', { name: 'Match any' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(captured.body).not.toBeNull());
    expect(captured.body).toEqual(
      expect.objectContaining({
        eventFilter: {
          combinator: 'or',
          filters: [
            { field: 'sessionId', operator: 'equals', value: 'session-1' },
            { field: 'agentName', operator: 'equals', value: 'Coder' },
          ],
        },
      }),
    );
    expect(JSON.stringify(captured.body)).not.toContain('event-filter-row');
  });

  it('offers null operators, clears stale value errors, and submits without a value', async () => {
    const subscriber = makeSubscriber();
    const captured = installApiMock(subscriber);

    renderEditDialog(subscriber);
    fireEvent.click(await screen.findByRole('button', { name: 'Add event filter' }));
    fireEvent.change(screen.getByPlaceholderText('sessionId'), {
      target: { value: 'parentId' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Update' }));
    await waitFor(() => expect(screen.getByText('Filter value is required')).toBeInTheDocument());

    const operator = screen.getByRole('combobox', { name: 'Operator' });
    fireEvent.click(operator);
    expect(await screen.findByRole('option', { name: 'Is null' })).toBeInTheDocument();
    expect(await screen.findByRole('option', { name: 'Is not null' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('option', { name: 'Is null' }));

    expect(screen.queryByText('Filter value is required')).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText('value')).not.toBeInTheDocument();
    expect(screen.getByText('Not required for this operator')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Update' }));

    await waitFor(() => expect(captured.body).not.toBeNull());
    expect(captured.body).toEqual(
      expect.objectContaining({
        eventFilter: {
          combinator: 'and',
          filters: [{ field: 'parentId', operator: 'is_null', value: '' }],
        },
      }),
    );
  });

  it('hydrates both null operators and canonicalizes stale imported values on save', async () => {
    const subscriber = makeSubscriber({
      eventFilter: {
        combinator: 'or',
        filters: [
          { field: 'parentId', operator: 'is_null', value: 'stale-null' },
          { field: 'parentId', operator: 'is_not_null', value: 'stale-not-null' },
        ],
      },
    });
    const captured = installApiMock(subscriber);

    renderEditDialog(subscriber);

    expect(await screen.findAllByDisplayValue('parentId')).toHaveLength(2);
    expect(screen.queryByDisplayValue('stale-null')).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue('stale-not-null')).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText('value')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Update' }));

    await waitFor(() => expect(captured.body).not.toBeNull());
    expect(captured.body).toEqual(
      expect.objectContaining({
        eventFilter: {
          combinator: 'or',
          filters: [
            { field: 'parentId', operator: 'is_null', value: '' },
            { field: 'parentId', operator: 'is_not_null', value: '' },
          ],
        },
      }),
    );
  });

  it('restores the editable value and required validation when switching to a scalar operator', async () => {
    const subscriber = makeSubscriber({
      eventFilter: { field: 'parentId', operator: 'is_null', value: '' },
    });
    const captured = installApiMock(subscriber);

    renderEditDialog(subscriber);

    expect(await screen.findByDisplayValue('parentId')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('value')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('combobox', { name: 'Operator' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Equals' }));

    expect(screen.getByPlaceholderText('value')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Update' }));
    await waitFor(() => expect(screen.getByText('Filter value is required')).toBeInTheDocument());
    expect(captured.body).toBeNull();

    fireEvent.change(screen.getByPlaceholderText('value'), { target: { value: 'root' } });
    fireEvent.click(screen.getByRole('button', { name: 'Update' }));

    await waitFor(() => expect(captured.body).not.toBeNull());
    expect(captured.body).toEqual(
      expect.objectContaining({
        eventFilter: {
          combinator: 'and',
          filters: [{ field: 'parentId', operator: 'equals', value: 'root' }],
        },
      }),
    );
  });
});
