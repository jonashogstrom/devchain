import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { getDefaultFilterId, getFilterById } from '@/ui/lib/saved-filters';
import {
  parseBoardFilters,
  serializeBoardFilters,
  type BoardFilterParams,
} from '@/ui/lib/url-filters';

const CANONICALIZED_LONG_KEYS = [
  'archived',
  'status',
  'parent',
  'agent',
  'tags',
  'q',
  'sub',
  'sort',
] as const;

export interface UseBoardRouteStateOptions {
  selectedProjectId: string | null | undefined;
}

export interface BoardRouteState {
  filters: BoardFilterParams;
  hasActiveFilters: boolean;
  toggleStatus: (statusId: string, statusIds: readonly string[]) => void;
  clearStatuses: () => void;
  setArchivedVisible: (showArchived: boolean) => void;
  setParent: (parentId: string | null) => void;
  setView: (view: 'kanban' | 'list') => void;
  setPage: (page: number) => void;
  setPageSize: (pageSize: number) => void;
  applySavedFilter: (queryString: string) => void;
}

function statusKey(statuses: readonly string[] | undefined): string {
  return statuses ? [...statuses].sort().join(',') : '';
}

export function useBoardRouteState({
  selectedProjectId,
}: UseBoardRouteStateOptions): BoardRouteState {
  const navigate = useNavigate();
  const location = useLocation();
  const appliedDefaultsRef = useRef<Set<string>>(new Set());
  const lastAutoAppliedRef = useRef<{ projectId: string; search: string } | null>(null);
  const filters = useMemo(() => parseBoardFilters(location.search), [location.search]);
  const previousStatusKeyRef = useRef(statusKey(filters.status));

  const navigateWithFilters = useCallback(
    (nextFilters: BoardFilterParams, replace: boolean): void => {
      const queryString = serializeBoardFilters(nextFilters);
      navigate(
        { pathname: location.pathname, search: queryString ? `?${queryString}` : '' },
        { replace },
      );
    },
    [location.pathname, navigate],
  );

  useEffect(() => {
    if (!selectedProjectId || appliedDefaultsRef.current.has(selectedProjectId)) return;

    const isCarryover =
      lastAutoAppliedRef.current !== null &&
      lastAutoAppliedRef.current.projectId !== selectedProjectId &&
      lastAutoAppliedRef.current.search === location.search;

    if (location.search !== '' && !isCarryover) {
      appliedDefaultsRef.current.add(selectedProjectId);
      return;
    }

    const defaultId = getDefaultFilterId(selectedProjectId);
    const savedFilter = defaultId ? getFilterById(selectedProjectId, defaultId) : null;
    const normalized = savedFilter
      ? serializeBoardFilters(parseBoardFilters(new URLSearchParams(savedFilter.qs)))
      : '';

    if (normalized) {
      const search = `?${normalized}`;
      navigate({ pathname: location.pathname, search }, { replace: true });
      lastAutoAppliedRef.current = { projectId: selectedProjectId, search };
    } else if (isCarryover) {
      navigate({ pathname: location.pathname, search: '' }, { replace: true });
      lastAutoAppliedRef.current = null;
    }

    appliedDefaultsRef.current.add(selectedProjectId);
  }, [location.pathname, location.search, navigate, selectedProjectId]);

  useEffect(() => {
    const currentStatusKey = statusKey(filters.status);
    if (
      previousStatusKeyRef.current !== currentStatusKey &&
      filters.page !== undefined &&
      filters.page > 1
    ) {
      const nextFilters = { ...filters };
      delete nextFilters.page;
      navigateWithFilters(nextFilters, true);
    }
    previousStatusKeyRef.current = currentStatusKey;
  }, [filters, navigateWithFilters]);

  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    if (!CANONICALIZED_LONG_KEYS.some((key) => searchParams.has(key))) return;

    const canonical = serializeBoardFilters(parseBoardFilters(location.search));
    const current = location.search.startsWith('?') ? location.search.slice(1) : location.search;
    if (canonical !== current) {
      navigate(
        { pathname: location.pathname, search: canonical ? `?${canonical}` : '' },
        { replace: true },
      );
    }
  }, [location.key, location.pathname, location.search, navigate]);

  const toggleStatus = useCallback(
    (statusId: string, statusIds: readonly string[]): void => {
      const currentStatuses = filters.status ?? [];
      let nextStatuses: string[];

      if (currentStatuses.length === 0) {
        nextStatuses = statusIds.filter((id) => id !== statusId);
      } else if (currentStatuses.includes(statusId)) {
        nextStatuses = currentStatuses.filter((id) => id !== statusId);
      } else {
        nextStatuses = [...currentStatuses, statusId];
      }

      const nextFilters: BoardFilterParams = { ...filters };
      if (nextStatuses.length === 0 || nextStatuses.length === statusIds.length) {
        delete nextFilters.status;
      } else {
        nextFilters.status = nextStatuses;
      }
      delete nextFilters.page;
      navigateWithFilters(nextFilters, true);
    },
    [filters, navigateWithFilters],
  );

  const clearStatuses = useCallback((): void => {
    const nextFilters = { ...filters };
    delete nextFilters.status;
    delete nextFilters.page;
    navigateWithFilters(nextFilters, true);
  }, [filters, navigateWithFilters]);

  const setArchivedVisible = useCallback(
    (showArchived: boolean): void => {
      const nextFilters: BoardFilterParams = {
        ...filters,
        archived: showArchived ? 'all' : 'active',
      };
      delete nextFilters.page;
      navigateWithFilters(nextFilters, true);
    },
    [filters, navigateWithFilters],
  );

  const setParent = useCallback(
    (parentId: string | null): void => {
      const nextFilters = { ...filters };
      if (parentId) {
        nextFilters.parent = parentId;
      } else {
        delete nextFilters.parent;
      }
      delete nextFilters.page;
      navigateWithFilters(nextFilters, false);
    },
    [filters, navigateWithFilters],
  );

  const setView = useCallback(
    (view: 'kanban' | 'list'): void => {
      navigateWithFilters({ ...filters, view }, true);
    },
    [filters, navigateWithFilters],
  );

  const setPage = useCallback(
    (page: number): void => {
      navigateWithFilters({ ...filters, page }, true);
    },
    [filters, navigateWithFilters],
  );

  const setPageSize = useCallback(
    (pageSize: number): void => {
      navigateWithFilters({ ...filters, page: 1, pageSize }, true);
    },
    [filters, navigateWithFilters],
  );

  const applySavedFilter = useCallback(
    (queryString: string): void => {
      const savedFilters = parseBoardFilters(queryString);
      delete savedFilters.page;
      delete savedFilters.pageSize;
      navigateWithFilters(savedFilters, false);
    },
    [navigateWithFilters],
  );

  return {
    filters,
    hasActiveFilters:
      (filters.status !== undefined && filters.status.length > 0) || filters.archived === 'all',
    toggleStatus,
    clearStatuses,
    setArchivedVisible,
    setParent,
    setView,
    setPage,
    setPageSize,
    applySavedFilter,
  };
}
