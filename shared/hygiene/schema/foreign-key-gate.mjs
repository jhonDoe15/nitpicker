import { existsSync } from 'node:fs';
import path from 'node:path';
import { filesUnder } from '../../filesystem.mjs';
import { databaseKinds } from './database-kind.mjs';
import { migratesForeignKeys } from './foreign-key-index.mjs';

const SKIPPED = new Set(['node_modules', 'build', 'target', 'out', 'dist', 'bin', 'vendor']);

function isSkipped(_, entry) {
  return entry.name.startsWith('.') || SKIPPED.has(entry.name);
}

export function schemaProjectFiles(projectRoot) {
  if (!existsSync(projectRoot)) {
    return [];
  }
  return [...filesUnder(projectRoot, { skipDirectory: isSkipped })].map((file) =>
    path.relative(projectRoot, file).split(path.sep).join('/'),
  );
}

function gateOf(projectRoot, parseYaml) {
  const files = schemaProjectFiles(projectRoot);
  if (migratesForeignKeys(projectRoot, files, parseYaml)) {
    return () => false;
  }
  const kindOf = databaseKinds(projectRoot, files);
  return (file) => kindOf(file) !== 'mysql';
}

export function foreignKeyGate(projectRoot, parseYaml) {
  let gate;
  return (file) => {
    gate ??= gateOf(projectRoot, parseYaml);
    return gate(file);
  };
}
