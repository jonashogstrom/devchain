import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { readFileSync } from 'fs';
import { join } from 'path';
import { DEFAULT_PROJECT_WORKSPACE_ID } from './schema';

const MIGRATION_PATH = join(__dirname, '../../../../drizzle/0072_fat_vulcan.sql');
const MIGRATIONS_FOLDER = join(__dirname, '../../../../drizzle');

function readMigration(): string {
  return readFileSync(MIGRATION_PATH, 'utf8').replace(/--> statement-breakpoint/g, '');
}

describe('0072 project workspaces migration', () => {
  let sqlite: Database.Database;

  beforeEach(() => {
    sqlite = new Database(':memory:');
    sqlite.pragma('foreign_keys = ON');
    sqlite.exec(`
      CREATE TABLE projects (
        id text PRIMARY KEY NOT NULL,
        name text NOT NULL
      );
    `);
  });

  afterEach(() => {
    sqlite.close();
  });

  it('keeps the exported Default id aligned with both migration literals and their order', () => {
    const migration = readMigration();
    const insertMatch = migration.match(
      /INSERT INTO `project_workspaces`[\s\S]*?VALUES \('([^']+)', 'Default'/,
    );
    const alterMatch = migration.match(
      /ALTER TABLE `projects` ADD `workspace_id` text DEFAULT '([^']+)' NOT NULL/,
    );

    expect(insertMatch?.[1]).toBe(DEFAULT_PROJECT_WORKSPACE_ID);
    expect(alterMatch?.[1]).toBe(DEFAULT_PROJECT_WORKSPACE_ID);
    expect(migration.indexOf('INSERT INTO `project_workspaces`')).toBeLessThan(
      migration.indexOf('ALTER TABLE `projects` ADD `workspace_id`'),
    );
    expect(alterMatch?.[0]).not.toContain('REFERENCES');
    expect(migration).not.toMatch(/CREATE TABLE [`"]__new_projects/);
  });

  it('creates exactly one Default workspace through the full foreign-keys-on migration chain', () => {
    sqlite.close();
    sqlite = new Database(':memory:');
    sqlite.pragma('foreign_keys = ON');

    expect(() => migrate(drizzle(sqlite), { migrationsFolder: MIGRATIONS_FOLDER })).not.toThrow();
    expect(
      sqlite
        .prepare(
          'SELECT id, name, is_default, position FROM project_workspaces WHERE is_default = 1',
        )
        .all(),
    ).toEqual([
      {
        id: DEFAULT_PROJECT_WORKSPACE_ID,
        name: 'Default',
        is_default: 1,
        position: 0,
      },
    ]);
    expect(sqlite.prepare('SELECT COUNT(*) AS count FROM project_workspaces').get()).toEqual({
      count: 1,
    });
    expect(sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  });

  it('preserves existing projects and backfills every row while foreign keys are enabled', () => {
    sqlite.exec(`
      INSERT INTO projects (id, name) VALUES
        ('project-1', 'First'),
        ('project-2', 'Second'),
        ('project-3', 'Third');
    `);

    expect(() => sqlite.exec(readMigration())).not.toThrow();

    expect(sqlite.prepare('SELECT id, workspace_id FROM projects ORDER BY id').all()).toEqual([
      { id: 'project-1', workspace_id: DEFAULT_PROJECT_WORKSPACE_ID },
      { id: 'project-2', workspace_id: DEFAULT_PROJECT_WORKSPACE_ID },
      { id: 'project-3', workspace_id: DEFAULT_PROJECT_WORKSPACE_ID },
    ]);
    expect(
      sqlite.prepare('SELECT COUNT(*) AS count FROM projects WHERE workspace_id IS NULL').get(),
    ).toEqual({ count: 0 });
    expect(
      sqlite.prepare('SELECT id, name, is_default, position FROM project_workspaces').all(),
    ).toEqual([
      {
        id: DEFAULT_PROJECT_WORKSPACE_ID,
        name: 'Default',
        is_default: 1,
        position: 0,
      },
    ]);
    expect(sqlite.prepare("PRAGMA foreign_key_list('projects')").all()).toEqual([]);
    expect(sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  });

  it('enforces case-insensitive names and grant identity without making position unique', () => {
    sqlite.exec(readMigration());

    sqlite
      .prepare(
        `INSERT INTO project_workspaces
          (id, name, is_default, position, created_at, updated_at)
         VALUES (?, ?, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      )
      .run('workspace-2', 'Engineering');

    expect(() =>
      sqlite
        .prepare(
          `INSERT INTO project_workspaces
            (id, name, is_default, position, created_at, updated_at)
           VALUES (?, ?, 0, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        )
        .run('workspace-3', 'engineering'),
    ).toThrow(/UNIQUE constraint failed/);

    sqlite
      .prepare(
        'INSERT INTO paired_device_workspace_grants (device_kid, workspace_id) VALUES (?, ?)',
      )
      .run('device-kid', 'workspace-2');
    expect(() =>
      sqlite
        .prepare(
          'INSERT INTO paired_device_workspace_grants (device_kid, workspace_id) VALUES (?, ?)',
        )
        .run('device-kid', 'workspace-2'),
    ).toThrow(/UNIQUE constraint failed/);

    const positionIndex = sqlite
      .prepare("PRAGMA index_list('project_workspaces')")
      .all()
      .find((index) => (index as { name: string }).name === 'project_workspaces_position_idx') as
      | { unique: number }
      | undefined;
    expect(positionIndex?.unique).toBe(0);
    expect(sqlite.prepare('SELECT id FROM project_workspaces ORDER BY position, id').all()).toEqual(
      [{ id: DEFAULT_PROJECT_WORKSPACE_ID }, { id: 'workspace-2' }],
    );

    sqlite.prepare('DELETE FROM project_workspaces WHERE id = ?').run('workspace-2');
    expect(sqlite.prepare('SELECT * FROM paired_device_workspace_grants').all()).toEqual([]);
    expect(sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  });
});
