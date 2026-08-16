import { useCallback, useEffect, useState } from 'react';

const BOARD_PREFERENCES_KEY_PREFIX = 'devchain:board:columns:';

export interface BoardViewPreferences {
  collapsedStatusIds: string[];
  autoCollapseEmpty: boolean;
  explicitlyExpandedStatusIds: string[];
  viewMode: 'kanban' | 'list';
  listPageSize: number;
}

export interface UseBoardViewPreferencesOptions {
  selectedProjectId: string | null | undefined;
  parentFilter: string | undefined;
  routeView: 'kanban' | 'list' | undefined;
  routePageSize: number | undefined;
  onRouteViewChange: (view: 'kanban' | 'list') => void;
  onRoutePageSizeChange: (pageSize: number) => void;
}

export interface BoardViewPreferenceState {
  preferences: BoardViewPreferences;
  currentViewMode: 'kanban' | 'list';
  currentPageSize: number;
  toggleColumnCollapse: (statusId: string) => void;
  expandColumn: (statusId: string) => void;
  isColumnCollapsed: (statusId: string, isEmpty: boolean) => boolean;
  collapseAll: (statusIds: readonly string[]) => void;
  resetDefaults: () => void;
  changeViewMode: (view: 'kanban' | 'list') => void;
  changePageSize: (pageSize: number) => void;
}

function defaultPreferences(): BoardViewPreferences {
  return {
    collapsedStatusIds: [],
    autoCollapseEmpty: true,
    explicitlyExpandedStatusIds: [],
    viewMode: 'kanban',
    listPageSize: 25,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function readPreferences(projectId: string): BoardViewPreferences {
  const stored = window.localStorage.getItem(`${BOARD_PREFERENCES_KEY_PREFIX}${projectId}`);
  if (!stored) return defaultPreferences();

  try {
    const parsed: unknown = JSON.parse(stored);
    if (!isRecord(parsed)) return defaultPreferences();

    return {
      collapsedStatusIds: stringArray(parsed.collapsedStatusIds),
      autoCollapseEmpty:
        typeof parsed.autoCollapseEmpty === 'boolean' ? parsed.autoCollapseEmpty : true,
      explicitlyExpandedStatusIds: stringArray(parsed.explicitlyExpandedStatusIds),
      viewMode: parsed.viewMode === 'list' ? 'list' : 'kanban',
      listPageSize:
        typeof parsed.listPageSize === 'number' && parsed.listPageSize >= 1
          ? parsed.listPageSize
          : 25,
    };
  } catch {
    return defaultPreferences();
  }
}

function writePreferences(projectId: string, preferences: BoardViewPreferences): void {
  window.localStorage.setItem(
    `${BOARD_PREFERENCES_KEY_PREFIX}${projectId}`,
    JSON.stringify(preferences),
  );
}

export function useBoardViewPreferences({
  selectedProjectId,
  parentFilter,
  routeView,
  routePageSize,
  onRouteViewChange,
  onRoutePageSizeChange,
}: UseBoardViewPreferencesOptions): BoardViewPreferenceState {
  const [preferences, setPreferences] = useState<BoardViewPreferences>(defaultPreferences);
  const [sessionExpandedStatusIds, setSessionExpandedStatusIds] = useState<Set<string>>(
    () => new Set(),
  );

  useEffect(() => {
    setPreferences(selectedProjectId ? readPreferences(selectedProjectId) : defaultPreferences());
  }, [selectedProjectId]);

  useEffect(() => {
    setSessionExpandedStatusIds(new Set());
  }, [parentFilter, selectedProjectId]);

  const updatePreferences = useCallback(
    (update: (current: BoardViewPreferences) => BoardViewPreferences): void => {
      if (!selectedProjectId) return;
      setPreferences((current) => {
        const next = update(current);
        writePreferences(selectedProjectId, next);
        return next;
      });
    },
    [selectedProjectId],
  );

  const toggleColumnCollapse = useCallback(
    (statusId: string): void => {
      updatePreferences((current) => {
        const isCollapsed = current.collapsedStatusIds.includes(statusId);
        return {
          ...current,
          collapsedStatusIds: isCollapsed
            ? current.collapsedStatusIds.filter((id) => id !== statusId)
            : [...current.collapsedStatusIds, statusId],
          explicitlyExpandedStatusIds: isCollapsed
            ? [...new Set([...current.explicitlyExpandedStatusIds, statusId])]
            : current.explicitlyExpandedStatusIds.filter((id) => id !== statusId),
        };
      });
    },
    [updatePreferences],
  );

  const expandColumn = useCallback(
    (statusId: string): void => {
      if (preferences.collapsedStatusIds.includes(statusId)) {
        toggleColumnCollapse(statusId);
        return;
      }
      setSessionExpandedStatusIds((current) => new Set(current).add(statusId));
    },
    [preferences.collapsedStatusIds, toggleColumnCollapse],
  );

  const isColumnCollapsed = useCallback(
    (statusId: string, isEmpty: boolean): boolean => {
      if (preferences.collapsedStatusIds.includes(statusId)) return true;
      if (!isEmpty || !preferences.autoCollapseEmpty) return false;
      if (preferences.explicitlyExpandedStatusIds.includes(statusId)) return false;
      return !sessionExpandedStatusIds.has(statusId);
    },
    [preferences, sessionExpandedStatusIds],
  );

  const collapseAll = useCallback(
    (statusIds: readonly string[]): void => {
      updatePreferences((current) => ({
        ...current,
        collapsedStatusIds: [...statusIds],
        explicitlyExpandedStatusIds: [],
      }));
      setSessionExpandedStatusIds(new Set());
    },
    [updatePreferences],
  );

  const resetDefaults = useCallback((): void => {
    updatePreferences(() => defaultPreferences());
  }, [updatePreferences]);

  const currentViewMode = routeView ?? preferences.viewMode;
  const currentPageSize = routePageSize ?? preferences.listPageSize;

  const changeViewMode = useCallback(
    (view: 'kanban' | 'list'): void => {
      if (view === currentViewMode) return;
      updatePreferences((current) => ({ ...current, viewMode: view }));
      onRouteViewChange(view);
    },
    [currentViewMode, onRouteViewChange, updatePreferences],
  );

  const changePageSize = useCallback(
    (pageSize: number): void => {
      updatePreferences((current) => ({ ...current, listPageSize: pageSize }));
      onRoutePageSizeChange(pageSize);
    },
    [onRoutePageSizeChange, updatePreferences],
  );

  return {
    preferences,
    currentViewMode,
    currentPageSize,
    toggleColumnCollapse,
    expandColumn,
    isColumnCollapsed,
    collapseAll,
    resetDefaults,
    changeViewMode,
    changePageSize,
  };
}
