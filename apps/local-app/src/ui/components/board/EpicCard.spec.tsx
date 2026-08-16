import type { ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { EpicCard, type EpicCardProps } from '@/ui/components/board/EpicCard';
import type { Epic, Status } from '@/ui/types';

jest.mock('@/ui/components/shared/EpicTooltipWrapper', () => ({
  EpicTooltipWrapper: ({
    children,
    onViewDetails,
  }: {
    children: ReactNode;
    onViewDetails?: (event: React.MouseEvent) => void;
  }) => (
    <div>
      {children}
      <button
        type="button"
        onClick={(event) => onViewDetails?.(event)}
        aria-label="Tooltip epic details"
      >
        Details
      </button>
    </div>
  ),
}));

const status: Status = {
  id: 'todo',
  projectId: 'project-1',
  label: 'Todo',
  color: '#ffffff',
  position: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function createEpic(overrides: Partial<Epic> = {}): Epic {
  return {
    id: 'epic-1',
    projectId: 'project-1',
    title: 'Parent epic',
    description: null,
    statusId: status.id,
    version: 1,
    parentId: null,
    agentId: null,
    createdBy: null,
    tags: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function renderCard(epic = createEpic(), isActiveParent = false) {
  const props: EpicCardProps = {
    epic,
    onEdit: jest.fn(),
    onDelete: jest.fn(),
    onDragStart: jest.fn(),
    onDragEnd: jest.fn(),
    isDragging: false,
    onKeyboardMove: jest.fn(),
    onToggleParentFilter: jest.fn(),
    isActiveParent,
    onOpenEpicDetails: jest.fn(),
    statuses: [status],
  };
  render(<EpicCard {...props} />);
  return props;
}

describe('EpicCard detail intent', () => {
  it('underlines the active parent title', () => {
    const props = renderCard(createEpic(), true);

    expect(screen.getByTestId(`epic-title-${props.epic.id}`)).toHaveClass(
      'underline',
      'decoration-2',
    );
  });

  it('keeps a parent title click on the parent-filter intent', () => {
    const props = renderCard();

    fireEvent.click(screen.getByRole('button', { name: 'Open epic Parent epic' }));

    expect(props.onToggleParentFilter).toHaveBeenCalledWith(props.epic);
    expect(props.onOpenEpicDetails).not.toHaveBeenCalled();
  });

  it('opens child details from the child title', () => {
    const props = renderCard(createEpic({ title: 'Child epic', parentId: 'parent-1' }));

    fireEvent.click(screen.getByRole('button', { name: 'Open epic Child epic' }));

    expect(props.onOpenEpicDetails).toHaveBeenCalledWith(props.epic);
    expect(props.onToggleParentFilter).not.toHaveBeenCalled();
  });

  it('opens details with Enter using the required epic-shaped intent', () => {
    const props = renderCard();

    fireEvent.keyDown(screen.getByLabelText(/^Epic: Parent epic/), { key: 'Enter' });

    expect(props.onOpenEpicDetails).toHaveBeenCalledWith(props.epic);
  });

  it('opens details from the tooltip action', () => {
    const props = renderCard();

    fireEvent.click(screen.getByRole('button', { name: 'Tooltip epic details' }));

    expect(props.onOpenEpicDetails).toHaveBeenCalledWith(props.epic);
  });
});
