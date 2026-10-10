import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const SOURCE_FILE = /\.(?:[cm]?[jt]s|[jt]sx)$/u;
const SKIPPED_DIRECTORIES = new Set(['node_modules', '.git', 'dist', 'coverage', 'reports']);
const DIRNAME_JOIN =
  /path\.(?:join|resolve)\(\s*(?:import\.meta\.dirname|__dirname)\s*,\s*(['"])([^'"\n]+)\1\s*\)/gu;
const URL_PATTERN = /new URL\(\s*(['"])(\.{1,2}\/[^'"\n]+)\1\s*,\s*import\.meta\.url\s*\)/gu;

function* sourceFiles(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRECTORIES.has(entry.name) && !entry.name.startsWith('.nitpicker')) {
        yield* sourceFiles(path.join(directory, entry.name));
      }
    } else if (SOURCE_FILE.test(entry.name)) {
      yield path.join(directory, entry.name);
    }
  }
}

function literalTargets(text) {
  return [...text.matchAll(DIRNAME_JOIN), ...text.matchAll(URL_PATTERN)].map((match) => match[2]);
}

export function spawnedEntryFiles(projectRoot) {
  const entries = new Set();
  for (const file of sourceFiles(projectRoot)) {
    const text = readFileSync(file, 'utf8');
    for (const target of literalTargets(text)) {
      const resolved = path.resolve(path.dirname(file), target);
      if (SOURCE_FILE.test(resolved) && existsSync(resolved)) {
        entries.add(path.relative(projectRoot, resolved).split(path.sep).join('/'));
      }
    }
  }
  return [...entries].sort();
}
