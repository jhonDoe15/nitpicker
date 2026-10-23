import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { importClosure } from '../../../shared/import-closure.mjs';
import { RULES_TOOL } from '../rules/rule-hints.mjs';
import { createToolContext, mutationVersions, toolVersions } from './python-tools.mjs';

export const PYTHON_ANALYZER_NAME = 'python';
export const MUTATION_ANALYZER_NAME = 'mutation';
const UNRESOLVED_VERSION = 'unresolved';
const ANALYZER_TIMEOUT_MS = 30 * 60 * 1000;
const MUTATION_TIMEOUT_MS = 70 * 60 * 1000;
const MUTATION_SHARD_WEIGHT = 90;
const packageRoot = path.resolve(import.meta.dirname, '../../..');
const pythonRoot = path.join(packageRoot, 'languages/python');
const runnerPath = path.join(import.meta.dirname, 'python-runner.mjs');
const TEST_ONLY_FOLDERS = new Set(['fixtures', 'test-support']);

function importedRunnerFiles() {
  const entry = path.relative(packageRoot, runnerPath);
  return [...importClosure([entry], packageRoot).keys()].map((file) =>
    path.join(packageRoot, file),
  );
}

function pythonResourceFiles() {
  return readdirSync(pythonRoot, { recursive: true })
    .filter((file) => !file.endsWith('.test.mjs'))
    .filter((file) => !file.split(path.sep).some((folder) => TEST_ONLY_FOLDERS.has(folder)))
    .filter((file) => path.extname(file) !== '')
    .map((file) => path.join(pythonRoot, file));
}

export function configurationFiles() {
  const files = new Set([...pythonResourceFiles(), ...importedRunnerFiles()]);
  return [...files].map((file) => path.relative(packageRoot, file)).sort();
}

function hashConfiguration(settings, part) {
  const hash = createHash('sha256').update(JSON.stringify([part, settings]));
  for (const relativePath of configurationFiles()) {
    hash.update(`\0${relativePath}\0`);
    hash.update(readFileSync(path.join(packageRoot, relativePath)));
  }
  return hash.digest('hex');
}

function resolveVersion(liveProjectRoot, versions, { settings, probes }) {
  return versions(
    createToolContext({
      projectRoot: liveProjectRoot,
      liveRoot: liveProjectRoot,
      settings,
      probes,
    }),
  );
}

function pythonInvocation(settings, part) {
  return ({ projectRoot, liveProjectRoot, toolRoot }) => ({
    command: process.execPath,
    args: [
      runnerPath,
      '--part',
      part,
      '--project-root',
      projectRoot,
      '--live-root',
      liveProjectRoot,
      ...(Object.keys(settings).length === 0
        ? []
        : ['--python-settings', JSON.stringify(settings)]),
    ],
    cwd: toolRoot,
  });
}

function pythonAnalyzer(settings, probes) {
  return {
    name: PYTHON_ANALYZER_NAME,
    version: UNRESOLVED_VERSION,
    resolveVersion: (liveProjectRoot) =>
      resolveVersion(liveProjectRoot, toolVersions, { settings, probes }),
    configurationHash: hashConfiguration(settings, PYTHON_ANALYZER_NAME),
    exclusions: [],
    reportedTools: [
      'ruff',
      'ruff-format',
      'black',
      'coverage',
      'mypy',
      'pyright',
      'basedpyright',
      'structure',
      'crap',
      RULES_TOOL,
      'coverage-py',
      'duplicates',
      'coupling',
      'import-linter',
      'tests',
      'test-runtime',
      'dependencies',
    ],
    timeoutMs: ANALYZER_TIMEOUT_MS,
    createInvocation: pythonInvocation(settings, PYTHON_ANALYZER_NAME),
  };
}

function mutationAnalyzer(settings, probes) {
  return {
    name: MUTATION_ANALYZER_NAME,
    version: UNRESOLVED_VERSION,
    resolveVersion: (liveProjectRoot) =>
      resolveVersion(liveProjectRoot, mutationVersions, { settings, probes }),
    configurationHash: hashConfiguration(settings, MUTATION_ANALYZER_NAME),
    exclusions: [],
    reportedTools: ['mutmut'],
    dependencies: [PYTHON_ANALYZER_NAME],
    toleratedDependencyErrors: ['tests', 'test-runtime', 'dependencies'],
    shardWeight: MUTATION_SHARD_WEIGHT,
    timeoutMs: MUTATION_TIMEOUT_MS,
    createInvocation: pythonInvocation(settings, MUTATION_ANALYZER_NAME),
  };
}

export function createPythonAnalyzer(settings = {}) {
  return pythonAnalyzer(settings, new Map());
}

export function createMutationAnalyzer(settings = {}) {
  return mutationAnalyzer(settings, new Map());
}

export function createPythonAnalyzers(settings = {}) {
  const probes = new Map();
  return [pythonAnalyzer(settings, probes), mutationAnalyzer(settings, probes)];
}
