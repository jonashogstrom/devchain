import { fireEvent, render, screen } from '@testing-library/react';
import { MessagingSection } from './MessagingSection';
import { useSettingsData } from './useSettingsData';

jest.mock('./useSettingsData');

const useSettingsDataMock = useSettingsData as jest.MockedFunction<typeof useSettingsData>;

describe('MessagingSection', () => {
  const mutate = jest.fn();

  beforeEach(() => {
    mutate.mockReset();
  });

  it('keeps capacity editable and ignores delay ordering while ordinary pooling is disabled', () => {
    useSettingsDataMock.mockReturnValue({
      settings: {
        messagePool: {
          enabled: false,
          delayMs: 30000,
          maxWaitMs: 5000,
          maxMessages: 10,
          separator: '\n---\n',
        },
      },
      updateMessagePoolMutation: { mutate, isPending: false },
    } as unknown as ReturnType<typeof useSettingsData>);

    render(<MessagingSection />);

    expect(screen.getByLabelText('Debounce Delay (seconds)')).toBeDisabled();
    expect(screen.getByLabelText('Maximum Wait Time (seconds)')).toBeDisabled();
    expect(screen.getByLabelText('Message Separator')).toBeDisabled();
    expect(screen.getByLabelText('Maximum Messages')).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
    expect(screen.queryByText('(Must be ≥ debounce delay)')).not.toBeInTheDocument();
    expect(screen.getByText(/Delivery on Idle remains queued/)).toBeInTheDocument();
    expect(
      screen.getByText(/Default-lane flush threshold and idle-lane hard capacity/),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Maximum Messages'), { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(mutate).toHaveBeenCalledWith({
      enabled: false,
      delayMs: 30000,
      maxWaitMs: 5000,
      maxMessages: 12,
      separator: '\n---\n',
    });
  });

  it('enforces maximum-wait ordering while ordinary pooling is enabled', () => {
    useSettingsDataMock.mockReturnValue({
      settings: {
        messagePool: {
          enabled: true,
          delayMs: 30000,
          maxWaitMs: 5000,
          maxMessages: 10,
          separator: '\n---\n',
        },
      },
      updateMessagePoolMutation: { mutate, isPending: false },
    } as unknown as ReturnType<typeof useSettingsData>);

    render(<MessagingSection />);

    expect(screen.getByText('(Must be ≥ debounce delay)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });
});
