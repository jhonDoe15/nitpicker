import { readdirSync } from 'node:fs';
import path from 'node:path';
import { isMigrationFile } from '../../../../../../shared/hygiene/migrations/migration-files.mjs';
import { nearestManifest } from '../dependencies/package-manifest.mjs';
import { MIKRO_ORM } from '../persistence/orm-bindings.mjs';

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

function manifestsAbove(directory) {
  const manifests = [];
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

function migrationFolder(directory, entry) {
  return MIGRATION_FOLDERS.has(entry.name) || MIGRATION_FOLDERS.has(path.basename(directory));
}

function hasMigrations(root) {
  const pending = [{ directory: root, depth: 0 }];
  for (const { directory, depth } of pending) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      const relative = path.relative(root, absolute).split(path.sep).join('/');
      if (
        entry.isFile() &&
        MIGRATION_FOLDERS.has(path.basename(directory)) &&
        isMigrationFile(relative)
      ) {
        return true;
      }
      const walked = entry.isDirectory() && depth < MAX_DEPTH && !entry.name.startsWith('.');
      if (
        walked &&
        !SKIPPED_FOLDERS.has(entry.name) &&
        (depth < MAX_DEPTH - 1 || migrationFolder(directory, entry))
      ) {
        pending.push({ directory: absolute, depth: depth + 1 });
      }
    }
  }
  return false;
}

export function schemaSource(filename) {
  const manifests = manifestsAbove(path.dirname(filename));
  const dependencies = new Set(
    manifests
      .filter((manifest) => manifest.kind === 'manifest')
      .flatMap((manifest) => [...manifest.runtime, ...manifest.development]),
  );
  const top = manifests.at(-1);
  return {
    dependencies,
    fromMigrations: top !== undefined && hasMigrations(path.dirname(top.file)),
  };
}

export function indexesItself({ dependencies }, orm) {
  if (orm === MIKRO_ORM) {
    return !MIKRO_ORM_UNINDEXED.some((name) => dependencies.has(name));
  }
  const mysql = MYSQL_DRIVERS.some((name) => dependencies.has(name));
  return mysql && !POSTGRES_DRIVERS.some((name) => dependencies.has(name));
}
