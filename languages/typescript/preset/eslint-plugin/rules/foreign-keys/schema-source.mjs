import path from 'node:path';
import { filesUnder } from '../../../../../../shared/filesystem.mjs';
import { isMigrationFile } from '../../../../../../shared/hygiene/migrations/migration-files.mjs';
import { nearestManifest } from '../dependencies/package-manifest.mjs';
import { MIKRO_ORM } from '../persistence/orm-bindings.mjs';

const SKIPPED_FOLDERS = new Set(['node_modules', 'dist', 'build', 'coverage', 'out']);
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
const MIKRO_ORM_POSTGRES = '@mikro-orm/postgresql';

function isSkipped(_absolute, entry) {
  return entry.name.startsWith('.') || SKIPPED_FOLDERS.has(entry.name);
}

function hasMigrations(root) {
  for (const file of filesUnder(root, { skipDirectory: isSkipped })) {
    if (isMigrationFile(path.relative(root, file).split(path.sep).join('/'))) {
      return true;
    }
  }
  return false;
}

export function schemaSource(filename) {
  const manifest = nearestManifest(path.dirname(filename));
  const dependencies =
    manifest?.kind === 'manifest'
      ? new Set([...manifest.runtime, ...manifest.development])
      : new Set();
  const root = manifest === undefined ? undefined : path.dirname(manifest.file);
  return {
    dependencies,
    fromMigrations: root !== undefined && hasMigrations(root),
  };
}

export function indexesItself({ dependencies }, orm) {
  if (orm === MIKRO_ORM) {
    return !dependencies.has(MIKRO_ORM_POSTGRES);
  }
  const mysql = MYSQL_DRIVERS.some((name) => dependencies.has(name));
  return mysql && !POSTGRES_DRIVERS.some((name) => dependencies.has(name));
}
