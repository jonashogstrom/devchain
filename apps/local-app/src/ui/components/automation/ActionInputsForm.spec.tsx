import { render, screen } from '@testing-library/react';
import { ActionInputsForm } from './ActionInputsForm';
import type { ActionMetadata } from '@/ui/lib/actions';

describe('ActionInputsForm', () => {
  it('renders an absent mapping from metadata without eagerly persisting it', () => {
    const onChange = jest.fn();
    const action: ActionMetadata = {
      type: 'send_agent_message',
      name: 'Send Message to Agent',
      description: 'Send a message',
      category: 'terminal',
      inputs: [
        {
          name: 'deliveryMode',
          label: 'Delivery Mode',
          description: 'Choose delivery timing',
          type: 'select',
          required: false,
          defaultValue: 'default',
          allowedSources: ['custom'],
          options: [
            { value: 'default', label: 'Default (queue)' },
            { value: 'immediate', label: 'Deliver Immediately' },
            { value: 'on_idle', label: 'Delivery on Idle' },
          ],
        },
      ],
    };

    render(<ActionInputsForm action={action} values={{}} onChange={onChange} />);

    expect(screen.getByText('Default (queue)')).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });
});
