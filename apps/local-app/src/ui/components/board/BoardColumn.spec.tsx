import type { ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { BoardColumn, type BoardColumnProps } from '@/ui/components/board/BoardColumn';
import type { Epic, Status } from '@/ui/types';

jest.mock('@/ui/components/board/EpicContextMenu', () => ({
  EpicContextMenu: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
jest.mock('@/ui/components/board/EpicCard', () => ({
  EpicCard: ({
    renderPreview,
    isActiveParent,
  }: {
    renderPreview?: () => ReactNode;
    isActiveParent: boolean;
  }) => (
    <div data-testid="epic-card" data-active-parent={String(isActiveParent)}>
      {renderPreview?.()}
    </div>
  ),
}));
jest.mock('@/ui/components/shared/EpicPreview', () => ({
  __esModule: true,
  default: ({ metaRight }: { metaRight?: ReactNode }) => <div>{metaRight}</div>,
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

const epic: Epic = {
  id: 'epic-1',
  projectId: 'project-1',
  title: 'Fixture epic',
  description: null,
  statusId: status.id,
  version: 1,
  parentId: null,
  agentId: null,
  createdBy: null,
  tags: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('BoardColumn preview adapter', () => {
  it('stops propagation and forwards the epic-shaped detail intent', () => {
    const onOpenEpicDetails = jest.fn();
    const documentClick = jest.fn();
    const props: BoardColumnProps = {
      status,
      epics: [epic],
      onAddEpic: jest.fn(),
      onEditEpic: jest.fn(),
      onDeleteEpic: jest.fn(),
      onDragStart: jest.fn(),
      onDragEnd: jest.fn(),
      onDragOver: jest.fn(),
      onDrop: jest.fn(),
      isActiveDrop: false,
      draggedEpic: null,
      onKeyboardMove: jest.fn(),
      onToggleParentFilter: jest.fn(),
      activeParentId: epic.id,
      statusOrder: [status],
      getAgentName: jest.fn(() => null),
      onCollapseColumn: jest.fn(),
      onBulkEdit: jest.fn(),
      onOpenEpicDetails,
      isLightColor: jest.fn(() => true),
    };
    document.addEventListener('click', documentClick);
    render(<BoardColumn {...props} />);

    fireEvent.click(screen.getByRole('button', { name: 'Open epic details' }));

    expect(onOpenEpicDetails).toHaveBeenCalledWith(epic);
    expect(documentClick).not.toHaveBeenCalled();
    expect(screen.getByTestId('epic-card')).toHaveAttribute('data-active-parent', 'true');
    document.removeEventListener('click', documentClick);
  });
});
