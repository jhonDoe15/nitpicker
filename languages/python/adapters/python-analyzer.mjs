import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { createToolContext, mutationVersions, toolVersions } from './python-tools.mjs';

export const PYTHON_ANALYZER_NAME = 'python';
export const MUTATION_ANALYZER_NAME = 'mutation';
const UNRESOLVED_VERSION = 'unresolved';
const ANALYZER_TIMEOUT_MS = 90 * 60 * 1000;
const MUTATION_TIMEOUT_MS = 70 * 60 * 1000;
const MUTATION_SHARD_WEIGHT = 90;
const packageRoot = path.resolve(import.meta.dirname, '../../..');
const pythonRoot = path.join(packageRoot, 'languages/python');
const runnerPath = path.join(import.meta.dirname, 'python-runner.mjs');
const IMPORT_PATTERN = /(?:from|import)\s+'(\.[^']+)'/g;

function importedFiles(entry) {
  const found = [entry];
  for (const file of found) {
    const imports = [...readFileSync(file, 'utf8').matchAll(IMPORT_PATTERN)].map(([, specifier]) =>
      path.resolve(path.dirname(file), specifier),
    );
    found.push(...new Set(imports.filter((imported) => !found.includes(imported))));
  }
  return found;
}

function pythonResourceFiles() {
  return readdirSync(pythonRoot, { recursive: true })
    .filter((file) => !file.endsWith('.test.mjs') && !file.split(path.sep).includes('fixtures'))
    .filter((file) => path.extname(file) !== '')
    .map((file) => path.join(pythonRoot, file));
}

export function configurationFiles() {
  const files = new Set([...pythonResourceFiles(), ...importedFiles(runnerPath)]);
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

function resolveVersion(liveProjectRoot, settings, versions) {
  return versions(
    createToolContext({ projectRoot: liveProjectRoot, liveRoot: liveProjectRoot, settings }),
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

export function createPythonAnalyzer(settings = {}) {
  return {
    name: PYTHON_ANALYZER_NAME,
    version: UNRESOLVED_VERSION,
    resolveVersion: (liveProjectRoot) => resolveVersion(liveProjectRoot, settings, toolVersions),
    configurationHash: hashConfiguration(settings, PYTHON_ANALYZER_NAME),
    exclusions: [],
    reportedTools: ['ruff', 'ruff-format', 'black', 'coverage'],
    timeoutMs: ANALYZER_TIMEOUT_MS,
    createInvocation: pythonInvocation(settings, PYTHON_ANALYZER_NAME),
  };
}

export function createMutationAnalyzer(settings = {}) {
  return {
    name: MUTATION_ANALYZER_NAME,
    version: UNRESOLVED_VERSION,
    resolveVersion: (liveProjectRoot) =>
      resolveVersion(liveProjectRoot, settings, mutationVersions),
    configurationHash: hashConfiguration(settings, MUTATION_ANALYZER_NAME),
    exclusions: [],
    reportedTools: ['mutmut'],
    dependencies: [PYTHON_ANALYZER_NAME],
    shardWeight: MUTATION_SHARD_WEIGHT,
    timeoutMs: MUTATION_TIMEOUT_MS,
    createInvocation: pythonInvocation(settings, MUTATION_ANALYZER_NAME),
  };
}

export function createPythonAnalyzers(settings = {}) {
  return [createPythonAnalyzer(settings), createMutationAnalyzer(settings)];
}
