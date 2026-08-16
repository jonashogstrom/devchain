import React, { useState } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import { useBoardRouteState, type BoardRouteState } from '@/ui/hooks/board/useBoardRouteState';

let routeState: BoardRouteState;
let externalNavigate: ReturnType<typeof useNavigate>;

function RouteProbe({ selectedProjectId = 'project-1' }: { selectedProjectId?: string }) {
  routeState = useBoardRouteState({ selectedProjectId });
  const location = useLocation();
  const navigationType = useNavigationType();
  externalNavigate = useNavigate();

  return (
    <>
      <div data-testid="search">{location.search}</div>
      <div data-testid="navigation-type">{navigationType}</div>
    </>
  );
}

function ProjectSwitchProbe() {
  const [projectId, setProjectId] = useState('project-a');
  routeState = useBoardRouteState({ selectedProjectId: projectId });
  const location = useLocation();
  const navigationType = useNavigationType();
  externalNavigate = useNavigate();

  return (
    <>
      <button type="button" onClick={() => setProjectId('project-b')}>
        Switch project
      </button>
      <div data-testid="search">{location.search}</div>
      <div data-testid="navigation-type">{navigationType}</div>
    </>
  );
}

function renderRoute(initialEntry: string, element: React.ReactNode = <RouteProbe />) {
  return render(<MemoryRouter initialEntries={[initialEntry]}>{element}</MemoryRouter>);
}

function expectLocation(search: string, navigationType: 'PUSH' | 'REPLACE' | 'POP') {
  expect(screen.getByTestId('search')).toHaveTextContent(search);
  expect(screen.getByTestId('navigation-type')).toHaveTextContent(navigationType);
}

describe('useBoardRouteState', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('parses filters while keeping router objects behind its interface', () => {
    renderRoute('/board?p=parent-1&st=review&unknown=1');

    expect(routeState.filters).toEqual({ parent: 'parent-1', status: ['review'] });
    expect(routeState).not.toHaveProperty('location');
    expect(routeState).not.toHaveProperty('navigate');
  });

  it('applies a project default once with replace and leaves an explicit URL alone', async () => {
    window.localStorage.setItem(
      'devchain:board:savedFilters:project-1',
      JSON.stringify([{ id: 'default', name: 'Default', qs: 'st=review' }]),
    );
    window.localStorage.setItem('devchain:board:defaultFilterId:project-1', 'default');

    renderRoute('/board');

    await waitFor(() => expectLocation('?st=review', 'REPLACE'));
  });

  it('does not apply a default over explicit filters', async () => {
    window.localStorage.setItem(
      'devchain:board:savedFilters:project-1',
      JSON.stringify([{ id: 'default', name: 'Default', qs: 'st=review' }]),
    );
    window.localStorage.setItem('devchain:board:defaultFilterId:project-1', 'default');

    renderRoute('/board?st=done');

    await waitFor(() => expectLocation('?st=done', 'POP'));
  });

  it('replaces an auto-applied filter with the next project default', async () => {
    window.localStorage.setItem(
      'devchain:board:savedFilters:project-a',
      JSON.stringify([{ id: 'a', name: 'A', qs: 'st=todo' }]),
    );
    window.localStorage.setItem('devchain:board:defaultFilterId:project-a', 'a');
    window.localStorage.setItem(
      'devchain:board:savedFilters:project-b',
      JSON.stringify([{ id: 'b', name: 'B', qs: 'st=done' }]),
    );
    window.localStorage.setItem('devchain:board:defaultFilterId:project-b', 'b');
    renderRoute('/board', <ProjectSwitchProbe />);
    await waitFor(() => expect(screen.getByTestId('search')).toHaveTextContent('?st=todo'));

    act(() => screen.getByRole('button', { name: 'Switch project' }).click());

    await waitFor(() => expectLocation('?st=done', 'REPLACE'));
  });

  it('clears auto-applied carryover when the next project has no default', async () => {
    window.localStorage.setItem(
      'devchain:board:savedFilters:project-a',
      JSON.stringify([{ id: 'a', name: 'A', qs: 'st=todo' }]),
    );
    window.localStorage.setItem('devchain:board:defaultFilterId:project-a', 'a');
    renderRoute('/board', <ProjectSwitchProbe />);
    await waitFor(() => expect(screen.getByTestId('search')).toHaveTextContent('?st=todo'));

    act(() => screen.getByRole('button', { name: 'Switch project' }).click());

    await waitFor(() => expectLocation('', 'REPLACE'));
  });

  it('canonicalizes only the existing long-key whitelist with replace', async () => {
    renderRoute(
      '/board?archived=all&status=review&parent=p1&agent=a1&tags=bug&q=hello&sub=true&sort=updated',
    );

    await waitFor(() =>
      expectLocation('?ar=all&st=review&p=p1&a=a1&t=bug&q=hello&sb=1&s=updated', 'REPLACE'),
    );
  });

  it.each([
    ['/board?view=list', '?view=list'],
    ['/board?page=2', '?page=2'],
    ['/board?pageSize=50', '?pageSize=50'],
    ['/board?sb=true', '?sb=true'],
    ['/board?sb=false', '?sb=false'],
  ])('does not newly rewrite %s', async (entry, expectedSearch) => {
    renderRoute(entry);

    await waitFor(() => expectLocation(expectedSearch, 'POP'));
  });

  it('retains long sub boolean-word conversion', async () => {
    renderRoute('/board?sub=false');

    await waitFor(() => expectLocation('?sb=0', 'REPLACE'));
  });

  it('replaces status changes and removes pg', async () => {
    renderRoute('/board?st=todo&pg=3');

    act(() => routeState.toggleStatus('done', ['todo', 'doing', 'done']));

    await waitFor(() => expectLocation('?st=done,todo', 'REPLACE'));
  });

  it('replaces archived changes, removes pg, and writes ar=active when disabled', async () => {
    renderRoute('/board?ar=all&pg=3');

    act(() => routeState.setArchivedVisible(false));

    await waitFor(() => expectLocation('?ar=active', 'REPLACE'));
  });

  it('reactively removes pg after an out-of-band mounted-router status change', async () => {
    renderRoute('/board?st=todo&pg=2');

    act(() => {
      externalNavigate('/board?st=done&pg=2');
    });

    await waitFor(() => expectLocation('?st=done', 'REPLACE'));
  });

  it('does not navigate again when the mounted-router status set is stable at pg=2', async () => {
    renderRoute('/board?st=todo&pg=2');

    act(() => {
      externalNavigate('/board?st=todo&q=stable&pg=2');
    });

    await waitFor(() => expectLocation('?st=todo&q=stable&pg=2', 'PUSH'));
  });

  it('pushes parent set and clear actions and removes pg', async () => {
    renderRoute('/board?pg=4');

    act(() => routeState.setParent('parent-1'));
    await waitFor(() => expectLocation('?p=parent-1', 'PUSH'));

    act(() => routeState.setParent(null));
    await waitFor(() => expectLocation('', 'PUSH'));
  });

  it('replaces view and page actions without an implicit page reset', async () => {
    renderRoute('/board?pg=2');

    act(() => routeState.setView('list'));
    await waitFor(() => expectLocation('?v=list&pg=2', 'REPLACE'));

    act(() => routeState.setPage(5));
    await waitFor(() => expectLocation('?v=list&pg=5', 'REPLACE'));
  });

  it('replaces page size and emits explicit pg=1', async () => {
    renderRoute('/board?pg=4');

    act(() => routeState.setPageSize(50));

    await waitFor(() => expectLocation('?pg=1&ps=50', 'REPLACE'));
  });

  it('pushes a manual saved filter and removes both pg and ps', async () => {
    renderRoute('/board?st=todo&pg=4&ps=50');

    act(() => routeState.applySavedFilter('st=done&pg=9&ps=100'));

    await waitFor(() => expectLocation('?st=done', 'PUSH'));
  });
});
