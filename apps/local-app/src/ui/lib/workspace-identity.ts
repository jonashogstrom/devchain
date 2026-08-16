export interface WorkspaceIdentity {
  readonly initial: string;
  readonly baseClassName: string;
  readonly selectedClassName: string;
}

const WORKSPACE_COLOR_STYLES = [
  {
    base: 'border-sky-500/30 bg-sky-500/10 text-sky-800 hover:border-sky-500/50 hover:bg-sky-500/20 hover:text-sky-900 dark:text-sky-300 dark:hover:text-sky-200',
    selected: 'border-sky-500/50 bg-sky-500/20 text-sky-900 hover:bg-sky-500/30 dark:text-sky-200',
  },
  {
    base: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-800 hover:border-cyan-500/50 hover:bg-cyan-500/20 hover:text-cyan-900 dark:text-cyan-300 dark:hover:text-cyan-200',
    selected:
      'border-cyan-500/50 bg-cyan-500/20 text-cyan-900 hover:bg-cyan-500/30 dark:text-cyan-200',
  },
  {
    base: 'border-teal-500/30 bg-teal-500/10 text-teal-800 hover:border-teal-500/50 hover:bg-teal-500/20 hover:text-teal-900 dark:text-teal-300 dark:hover:text-teal-200',
    selected:
      'border-teal-500/50 bg-teal-500/20 text-teal-900 hover:bg-teal-500/30 dark:text-teal-200',
  },
  {
    base: 'border-blue-500/30 bg-blue-500/10 text-blue-800 hover:border-blue-500/50 hover:bg-blue-500/20 hover:text-blue-900 dark:text-blue-300 dark:hover:text-blue-200',
    selected:
      'border-blue-500/50 bg-blue-500/20 text-blue-900 hover:bg-blue-500/30 dark:text-blue-200',
  },
  {
    base: 'border-indigo-500/30 bg-indigo-500/10 text-indigo-800 hover:border-indigo-500/50 hover:bg-indigo-500/20 hover:text-indigo-900 dark:text-indigo-300 dark:hover:text-indigo-200',
    selected:
      'border-indigo-500/50 bg-indigo-500/20 text-indigo-900 hover:bg-indigo-500/30 dark:text-indigo-200',
  },
  {
    base: 'border-violet-500/30 bg-violet-500/10 text-violet-800 hover:border-violet-500/50 hover:bg-violet-500/20 hover:text-violet-900 dark:text-violet-300 dark:hover:text-violet-200',
    selected:
      'border-violet-500/50 bg-violet-500/20 text-violet-900 hover:bg-violet-500/30 dark:text-violet-200',
  },
  {
    base: 'border-purple-500/30 bg-purple-500/10 text-purple-800 hover:border-purple-500/50 hover:bg-purple-500/20 hover:text-purple-900 dark:text-purple-300 dark:hover:text-purple-200',
    selected:
      'border-purple-500/50 bg-purple-500/20 text-purple-900 hover:bg-purple-500/30 dark:text-purple-200',
  },
  {
    base: 'border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-800 hover:border-fuchsia-500/50 hover:bg-fuchsia-500/20 hover:text-fuchsia-900 dark:text-fuchsia-300 dark:hover:text-fuchsia-200',
    selected:
      'border-fuchsia-500/50 bg-fuchsia-500/20 text-fuchsia-900 hover:bg-fuchsia-500/30 dark:text-fuchsia-200',
  },
] as const;

function workspaceColorIndex(name: string): number {
  const normalizedName = name.trim().normalize('NFKC').toLowerCase();
  let hash = 0;

  for (const character of normalizedName) {
    hash = (Math.imul(hash, 31) + (character.codePointAt(0) ?? 0)) >>> 0;
  }

  return hash % WORKSPACE_COLOR_STYLES.length;
}

export function getWorkspaceIdentity(name: string): WorkspaceIdentity {
  const style = WORKSPACE_COLOR_STYLES[workspaceColorIndex(name)];
  return {
    initial: Array.from(name.trim())[0]?.toLocaleUpperCase() ?? '?',
    baseClassName: style.base,
    selectedClassName: style.selected,
  };
}
