import { readdirSync } from 'node:fs';
import path from 'node:path';
import { globToRegExp } from '../../../shared/glob.mjs';
import { collectFileLimitFindings } from '../../../shared/rules/file-limits.mjs';

const SKIPPED_DIRECTORIES = new Set([
  '__pycache__',
  'venv',
  'node_modules',
  'site-packages',
  'build',
  'dist',
]);
const TEST_FILE = /(?:^|\/)(?:tests?\/|test_[^/]*\.py$|[^/]*_test\.py$|conftest\.py$)/u;

function directoryEntries(projectRoot, directory) {
  return readdirSync(path.join(projectRoot, directory), { withFileTypes: true }).map((entry) => ({
    entry,
    relative: directory === '' ? entry.name : `${directory}/${entry.name}`,
  }));
}

function pythonFiles(projectRoot) {
  const files = [];
  const pending = [''];
  for (const directory of pending) {
    const entries = directoryEntries(projectRoot, directory);
    pending.push(
      ...entries
        .filter(({ entry }) => entry.isDirectory())
        .filter(({ entry }) => !entry.name.startsWith('.') && !SKIPPED_DIRECTORIES.has(entry.name))
        .map(({ relative }) => relative),
    );
    files.push(
      ...entries
        .filter(({ entry }) => entry.isFile() && entry.name.endsWith('.py'))
        .map(({ relative }) => relative),
    );
  }
  return files;
}

export function pythonFileLimitFindings(projectRoot, { fileLimits = {}, exclude = [] }) {
  const excluders = exclude.map((glob) => globToRegExp(glob));
  const entries = pythonFiles(projectRoot)
    .filter((file) => !excluders.some((matcher) => matcher.test(file)))
    .map((file) => ({ path: file, kind: TEST_FILE.test(file) ? 'test' : 'source' }));
  return collectFileLimitFindings(projectRoot, entries, {
    analyzerName: 'structure',
    thresholds: fileLimits.thresholds,
    exceptions: fileLimits.exceptions,
  });
}
