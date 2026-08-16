import { render, screen } from '@testing-library/react';
import { CreateProjectDialog } from './CreateProjectDialog';

const defaultProps = {
  open: true,
  onOpenChange: jest.fn(),
  onSubmit: jest.fn(),
  templateSourceTab: 'template' as const,
  onTemplateSourceTabChange: jest.fn(),
  templateFormData: {
    name: 'New Project',
    description: '',
    rootPath: '/work/new-project',
    templateId: 'starter',
    version: '',
    templatePath: '',
    workspaceId: 'default',
  },
  onNameChange: jest.fn(),
  onDescriptionChange: jest.fn(),
  onVersionChange: jest.fn(),
  templates: [{ slug: 'starter', name: 'Starter', source: 'bundled' as const }],
  sortedVersions: ['2.0.0', '1.0.0'],
  onTemplateChange: jest.fn(),
  onTemplatePathChange: jest.fn(),
  onTemplateFilePathChange: jest.fn(),
  templatePathValidation: { isAbsolute: true, exists: true, checked: true },
  templateFilePathValidation: {
    isAbsolute: false,
    exists: false,
    checked: false,
    isFile: false,
  },
  onCancel: jest.fn(),
  isSubmitting: false,
};

describe('CreateProjectDialog', () => {
  it('renders version choice only for registry templates with available versions', () => {
    const { rerender } = render(
      <CreateProjectDialog {...defaultProps} selectedTemplateSource="bundled" />,
    );
    expect(screen.queryByLabelText('Version')).not.toBeInTheDocument();

    rerender(<CreateProjectDialog {...defaultProps} selectedTemplateSource="registry" />);
    expect(screen.getByLabelText('Version')).toBeInTheDocument();

    rerender(
      <CreateProjectDialog
        {...defaultProps}
        selectedTemplateSource="registry"
        sortedVersions={[]}
      />,
    );
    expect(screen.queryByLabelText('Version')).not.toBeInTheDocument();
  });

  it('shows workspace assignment only when multiple workspaces are enabled', () => {
    const { rerender } = render(<CreateProjectDialog {...defaultProps} />);
    expect(screen.queryByLabelText('Workspace')).not.toBeInTheDocument();

    rerender(
      <CreateProjectDialog
        {...defaultProps}
        showWorkspaceSelector
        workspaces={[
          {
            id: 'default',
            name: 'Default',
            isDefault: true,
            position: 0,
            projectCount: 1,
            deviceGrantCount: 0,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ]}
      />,
    );
    expect(screen.getByLabelText('Workspace')).toHaveTextContent('Default');
  });
});
