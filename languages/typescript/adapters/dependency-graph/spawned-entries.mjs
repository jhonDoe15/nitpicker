import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { projectFilesUnder } from '../../../../shared/project-files/project-files.mjs';

const SOURCE_FILE = /\.(?:[cm]?[jt]s|[jt]sx)$/u;
const SKIPPED_DIRECTORIES = new Set(['node_modules', '.git']);
const ROOT_OUTPUT_DIRECTORIES = new Set(['dist', 'coverage', 'reports']);
const DIRNAME_JOIN =
  /path\.(?:join|resolve)\(\s*(?:import\.meta\.dirname|__dirname)\s*,\s*(['"])([^'"\n]+)\1\s*\)/gu;
const URL_PATTERN = /new URL\(\s*(['"])(\.{1,2}\/[^'"\n]+)\1\s*,\s*import\.meta\.url\s*\)/gu;

function isSkipped(absolute, entry, directory) {
  return (
    SKIPPED_DIRECTORIES.has(entry.name) ||
    (path.resolve(path.dirname(absolute)) === path.resolve(directory) &&
      ROOT_OUTPUT_DIRECTORIES.has(entry.name)) ||
    entry.name.startsWith('.nitpicker')
  );
}

function sourceFiles(directory) {
  return projectFilesUnder(directory, {
    skipDirectory: (absolute, entry) => isSkipped(absolute, entry, directory),
  }).filter((file) => SOURCE_FILE.test(path.basename(file)));
}

function literalTargets(text) {
  return [...text.matchAll(DIRNAME_JOIN), ...text.matchAll(URL_PATTERN)].map((match) => match[2]);
}

function existingTargets(file) {
  return literalTargets(readFileSync(file, 'utf8'))
    .map((target) => path.resolve(path.dirname(file), target))
    .filter((resolved) => SOURCE_FILE.test(resolved) && existsSync(resolved));
}

export function spawnedEntryFiles(projectRoot) {
  const entries = new Set();
  for (const file of sourceFiles(projectRoot)) {
    for (const resolved of existingTargets(file)) {
      entries.add(path.relative(projectRoot, resolved).split(path.sep).join('/'));
    }
  }
  return [...entries].sort();
}
