import { readdirSync } from 'node:fs';
import path from 'node:path';
import { globToRegExp } from '../../../../shared/glob.mjs';
import { collectFileLimitFindings } from '../../../../shared/rules/file-limits.mjs';
import { readStructureFindings } from '../../../java/adapters/metrics/java-structure.mjs';
import { run } from '../execution/python-process.mjs';
import { functionText, writeSourceListing } from './python-sources.mjs';

const METRICS_SCRIPT = path.resolve(
  new URL('../', import.meta.url).pathname,
  '../metrics/structure_metrics.py',
);
export const STRUCTURE_REPORT = 'structure.json';
const STRUCTURE_HINTS = {
  maxControlNesting:
    'An elif chain counts one level per branch; use match, a dict lookup or a helper function.',
};

export function structure(context) {
  const { listing } = writeSourceListing(context);
  run(
    context,
    [
      'python',
      METRICS_SCRIPT,
      path.join(context.reportRoot, STRUCTURE_REPORT),
      context.projectRoot,
      listing,
    ],
    { rule: 'structure-failed' },
  );
}

export function readPythonStructureFindings(reportRoot, projectRoot) {
  return readStructureFindings(reportRoot, projectRoot, {
    textOf: functionText,
    hints: STRUCTURE_HINTS,
  });
}

const SKIPPED_DIRECTORIES = new Set([
  '__pycache__',
  'venv',
  'env',
  'migrations',
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

export function pythonFileLimitFindings(
  projectRoot,
  { fileLimits, exclude = [], exceptions = [] },
) {
  const excluders = exclude.map((glob) => globToRegExp(glob));
  const entries = pythonFiles(projectRoot)
    .filter((file) => !excluders.some((matcher) => matcher.test(file)))
    .map((file) => ({
      path: file,
      kind: TEST_FILE.test(file) ? 'test' : 'source',
      countsInFolder: path.posix.basename(file) !== '__init__.py',
    }));
  return collectFileLimitFindings(projectRoot, entries, {
    analyzerName: 'structure',
    thresholds: fileLimits,
    exceptions,
  });
}
