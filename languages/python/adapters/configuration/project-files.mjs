import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

export function isTable(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function insideRoot(projectRoot, name) {
  const root = path.resolve(projectRoot);
  const full = path.resolve(root, name);
  return full === root || full.startsWith(root + path.sep) ? full : undefined;
}

export function readProjectFile(projectRoot, name) {
  const full = insideRoot(projectRoot, name);
  return full !== undefined && existsSync(full) ? readFileSync(full, 'utf8') : undefined;
}

export function listProjectFiles(projectRoot, folder) {
  const full = insideRoot(projectRoot, folder);
  return full !== undefined && existsSync(full) ? readdirSync(full) : [];
}

export function parseToml(text) {
  try {
    return { kind: 'table', table: createRequire(import.meta.url)('smol-toml').parse(text) };
  } catch (error) {
    return { kind: 'invalid', error };
  }
}

export function tomlProblem(error) {
  const [summary] = String(error?.message ?? error).split('\n');
  return error?.line === undefined
    ? summary
    : `${summary} (line ${String(error.line)}, column ${String(error.column)})`;
}

export function tomlTable(projectRoot, name) {
  const text = readProjectFile(projectRoot, name);
  const parsed = text === undefined ? undefined : parseToml(text);
  return parsed?.kind === 'table' ? parsed.table : undefined;
}
