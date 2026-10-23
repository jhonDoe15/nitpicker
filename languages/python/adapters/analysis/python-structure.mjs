import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { globMatcher } from '../../../../shared/paths/glob.mjs';
import { projectFilesUnder } from '../../../../shared/project-files/project-files.mjs';
import { collectFileLimitFindings } from '../../../../shared/rules/file-limits.mjs';
import { readStructureFindings } from '../../../../shared/ingest/structure-report.mjs';
import { run } from '../execution/python-process.mjs';
import { functionText, testFileMatcher, writeSourceListing } from './python-sources.mjs';
import { isGeneratedPython } from '../../libraries/generated-files.mjs';
import { fileURLToPath } from 'node:url';

const METRICS_SCRIPT = path.resolve(
  fileURLToPath(new URL('../', import.meta.url)),
  '../metrics/structure_metrics.py',
);
export const STRUCTURE_REPORT = 'structure.json';
export const CLASSES_REPORT = 'classes.json';
const STRUCTURE_HINTS = {
  maxControlNesting:
    'An if/elif chain counts as one level; use match, a dict lookup or a helper function for what nests inside a branch.',
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
      path.join(context.reportRoot, CLASSES_REPORT),
    ],
    { rule: 'structure-failed' },
  );
}

export function readPythonStructureFindings(reportRoot, projectRoot) {
  return readStructureFindings(reportRoot, projectRoot, {
    textOf: functionText,
    hints: STRUCTURE_HINTS,
    numberedAmongSameSource: true,
  });
}

export function readPythonFunctions(reportRoot) {
  const report = path.join(reportRoot, STRUCTURE_REPORT);
  return existsSync(report) ? JSON.parse(readFileSync(report, 'utf8')) : [];
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

function pythonFiles(projectRoot) {
  return projectFilesUnder(projectRoot, {
    skipDirectory: (_, entry) => entry.name.startsWith('.') || SKIPPED_DIRECTORIES.has(entry.name),
  })
    .filter((file) => file.endsWith('.py'))
    .map((file) => path.relative(projectRoot, file).split(path.sep).join('/'));
}

export function pythonFileLimitFindings(
  projectRoot,
  { fileLimits, exclude = [], exceptions = [] },
) {
  const excluders = exclude.map((glob) => globMatcher(glob));
  const isTest = testFileMatcher(projectRoot);
  const entries = pythonFiles(projectRoot)
    .filter((file) => !excluders.some((matcher) => matcher.test(file)))
    .filter((file) => !isGeneratedPython(projectRoot, file))
    .map((file) => ({
      path: file,
      kind: isTest(file) ? 'test' : 'source',
      countsInFolder: path.posix.basename(file) !== '__init__.py',
    }));
  return collectFileLimitFindings(projectRoot, entries, {
    analyzerName: 'structure',
    thresholds: fileLimits,
    exceptions,
  });
}
