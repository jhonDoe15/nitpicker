import { readdirSync, type Dirent } from 'node:fs';
import path from 'node:path';
import { isMigrationFile as untypedIsMigrationFile } from '../../../../../../shared/hygiene/migrations/migration-files.mjs';
import { nearestManifest, type Manifest } from '../dependencies/package-manifest.mts';
import { MIKRO_ORM } from '../persistence/orm-bindings.mts';

export type SchemaSource = {
  readonly dependencies: ReadonlySet<string>;
  readonly fromMigrations: boolean;
};
type Frame = { readonly directory: string; readonly depth: number };

const isMigrationFile: (relative: string) => boolean = untypedIsMigrationFile;

const SKIPPED_FOLDERS = new Set(['node_modules', 'dist', 'build', 'coverage', 'out']);
const MAX_DEPTH = 6;
const MIGRATION_FOLDERS = new Set(['migrations', 'migration', 'migrate', 'drizzle']);
const MYSQL_DRIVERS = [
  'mysql',
  'mysql2',
  'mariadb',
  '@planetscale/database',
  '@mikro-orm/mysql',
  '@mikro-orm/mariadb',
];
const POSTGRES_DRIVERS = [
  'pg',
  'postgres',
  'pg-promise',
  '@neondatabase/serverless',
  '@vercel/postgres',
  '@electric-sql/pglite',
  '@mikro-orm/postgresql',
];
const MIKRO_ORM_UNINDEXED = ['@mikro-orm/postgresql', '@mikro-orm/mssql'];

function manifestsAbove(directory: string): Manifest[] {
  const manifests: Manifest[] = [];
  const pending = [nearestManifest(directory)];
  for (const manifest of pending) {
    if (manifest !== undefined) {
      manifests.push(manifest);
      const parent = path.dirname(path.dirname(manifest.file));
      pending.push(parent === path.dirname(manifest.file) ? undefined : nearestManifest(parent));
    }
  }
  return manifests;
}

function migrationFolder(directory: string, entry: Dirent): boolean {
  return MIGRATION_FOLDERS.has(entry.name) || MIGRATION_FOLDERS.has(path.basename(directory));
}

function isMigrationEntry(root: string, directory: string, entry: Dirent): boolean {
  const relative = path.relative(root, path.join(directory, entry.name)).split(path.sep).join('/');
  return (
    entry.isFile() && MIGRATION_FOLDERS.has(path.basename(directory)) && isMigrationFile(relative)
  );
}

function isWalked({ directory, depth }: Frame, entry: Dirent): boolean {
  const walked = entry.isDirectory() && depth < MAX_DEPTH && !entry.name.startsWith('.');
  return (
    walked &&
    !SKIPPED_FOLDERS.has(entry.name) &&
    (depth < MAX_DEPTH - 1 || migrationFolder(directory, entry))
  );
}

function hasMigrations(root: string): boolean {
  const pending: Frame[] = [{ directory: root, depth: 0 }];
  for (const frame of pending) {
    const entries = readdirSync(frame.directory, { withFileTypes: true });
    if (entries.some((entry) => isMigrationEntry(root, frame.directory, entry))) {
      return true;
    }
    pending.push(
      ...entries
        .filter((entry) => isWalked(frame, entry))
        .map((entry) => ({
          directory: path.join(frame.directory, entry.name),
          depth: frame.depth + 1,
        })),
    );
  }
  return false;
}

export function schemaSource(filename: string): SchemaSource {
  const manifests = manifestsAbove(path.dirname(filename));
  const dependencies = new Set(
    manifests.flatMap((manifest) =>
      manifest.kind === 'manifest' ? [...manifest.runtime, ...manifest.development] : [],
    ),
  );
  const top = manifests.at(-1);
  return {
    dependencies,
    fromMigrations: top !== undefined && hasMigrations(path.dirname(top.file)),
  };
}

export function indexesItself({ dependencies }: SchemaSource, orm: string): boolean {
  if (orm === MIKRO_ORM) {
    return !MIKRO_ORM_UNINDEXED.some((name) => dependencies.has(name));
  }
  const mysql = MYSQL_DRIVERS.some((name) => dependencies.has(name));
  return mysql && !POSTGRES_DRIVERS.some((name) => dependencies.has(name));
}
