import { fireEvent, render, screen } from '@testing-library/react';
import { EditProjectDialog } from './EditProjectDialog';

const defaultProps = {
  open: true,
  onOpenChange: jest.fn(),
  formData: {
    name: 'Test Project',
    description: '',
    rootPath: '/tmp/test',
    isTemplate: false,
  },
  onNameChange: jest.fn(),
  onDescriptionChange: jest.fn(),
  onIsTemplateChange: jest.fn(),
  pathValidation: { isAbsolute: true, exists: true, checked: true },
  onPathChange: jest.fn(),
  onSubmit: jest.fn(),
  onCancel: jest.fn(),
  isSubmitting: false,
};

describe('EditProjectDialog', () => {
  it('renders the dialog with form fields', () => {
    render(<EditProjectDialog {...defaultProps} />);

    expect(screen.getByLabelText('Name *')).toHaveValue('Test Project');
    expect(screen.getByLabelText('Root Path *')).toHaveValue('/tmp/test');
    expect(screen.getByLabelText('Description')).toBeInTheDocument();
    expect(screen.getByLabelText('Mark as template')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Update' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('renders template state and emits its semantic change', () => {
    const onIsTemplateChange = jest.fn();
    render(
      <EditProjectDialog
        {...defaultProps}
        formData={{ ...defaultProps.formData, isTemplate: true }}
        onIsTemplateChange={onIsTemplateChange}
      />,
    );

    const checkbox = screen.getByLabelText('Mark as template');
    expect(checkbox).toHaveAttribute('data-state', 'checked');
    fireEvent.click(checkbox);
    expect(onIsTemplateChange).toHaveBeenCalledWith(false);
  });

  it('does not render any mobile notifications toggle', () => {
    render(<EditProjectDialog {...defaultProps} />);

    expect(screen.queryByText(/mobile.*notification/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    expect(screen.queryByTestId(/mobile-notifications/)).not.toBeInTheDocument();
  });

  it('does not render a Separator element', () => {
    const { container } = render(<EditProjectDialog {...defaultProps} />);
    // shadcn Separator renders a <hr> or div with role="separator"
    expect(container.querySelector('[role="separator"]')).not.toBeInTheDocument();
    expect(container.querySelector('hr')).not.toBeInTheDocument();
  });

  it('never renders or carries workspace assignment', () => {
    render(<EditProjectDialog {...defaultProps} />);
    expect(screen.queryByLabelText('Workspace')).not.toBeInTheDocument();
    expect(defaultProps.formData).not.toHaveProperty('workspaceId');
  });
});
