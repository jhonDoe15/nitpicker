import { existsSync } from 'node:fs';
import path from 'node:path';
import { filesUnder } from '../../../../../shared/filesystem.mjs';
import { databaseKinds } from '../../../../../shared/hygiene/schema/database-kind.mjs';
import { migratesForeignKeys } from '../../../../../shared/hygiene/schema/foreign-key-index.mjs';

export const FOREIGN_KEY_RULE = 'JpaUnindexedForeignKey';

const SKIPPED = new Set(['node_modules', 'build', 'target', 'out', 'dist', 'bin', 'vendor']);

function isSkipped(_, entry) {
  return entry.name.startsWith('.') || SKIPPED.has(entry.name);
}

function projectFiles(projectRoot) {
  if (!existsSync(projectRoot)) {
    return [];
  }
  return [...filesUnder(projectRoot, { skipDirectory: isSkipped })].map((file) =>
    path.relative(projectRoot, file).split(path.sep).join('/'),
  );
}

function gateOf(projectRoot) {
  const files = projectFiles(projectRoot);
  if (migratesForeignKeys(projectRoot, files)) {
    return () => false;
  }
  const kindOf = databaseKinds(projectRoot, files);
  return (file) => kindOf(file) !== 'mysql';
}

export function foreignKeyGate(projectRoot) {
  let gate;
  return (file) => {
    gate ??= gateOf(projectRoot);
    return gate(file);
  };
}
