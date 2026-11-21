import { existsSync } from 'node:fs';
import path from 'node:path';
import { filesUnder } from '../../filesystem.mts';
import { databaseKinds } from './database-kind.mts';
import { migratesForeignKeys } from './foreign-key-index.mts';
import type { ParseYaml } from '../check-types.mts';

const SKIPPED = new Set(['node_modules', 'build', 'target', 'out', 'dist', 'bin', 'vendor']);

function isSkipped(_directory: string, entry: { readonly name: string }): boolean {
  return entry.name.startsWith('.') || SKIPPED.has(entry.name);
}

export function schemaProjectFiles(projectRoot: string): string[] {
  if (!existsSync(projectRoot)) {
    return [];
  }
  return [...filesUnder(projectRoot, { skipDirectory: isSkipped })].map((file) =>
    path.relative(projectRoot, file).split(path.sep).join('/'),
  );
}

function gateOf(projectRoot: string, parseYaml?: ParseYaml): (file: string) => boolean {
  const files = schemaProjectFiles(projectRoot);
  if (migratesForeignKeys(projectRoot, files, parseYaml)) {
    return () => false;
  }
  const kindOf = databaseKinds(projectRoot, files);
  return (file) => kindOf(file) !== 'mysql';
}

function isParseYaml(value: unknown): value is ParseYaml {
  return typeof value === 'function';
}

export function foreignKeyGate(
  projectRoot: string,
  parseYaml?: unknown,
): (file: string) => boolean {
  let gate: ((file: string) => boolean) | undefined;
  return (file) => {
    gate ??= gateOf(projectRoot, isParseYaml(parseYaml) ? parseYaml : undefined);
    return gate(file);
  };
}
