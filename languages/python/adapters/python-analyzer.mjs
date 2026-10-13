import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { PINNED_VERSIONS_SOURCE } from './python-crap.mjs';
import { createToolContext, toolVersions } from './python-tools.mjs';

export const PYTHON_ANALYZER_NAME = 'python';
const UNRESOLVED_VERSION = 'unresolved';
const ANALYZER_TIMEOUT_MS = 30 * 60 * 1000;
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
  const files = new Set([
    ...pythonResourceFiles(),
    ...importedFiles(runnerPath),
    PINNED_VERSIONS_SOURCE,
  ]);
  return [...files].map((file) => path.relative(packageRoot, file)).sort();
}

function hashConfiguration(settings) {
  const hash = createHash('sha256').update(JSON.stringify(settings));
  for (const relativePath of configurationFiles()) {
    hash.update(`\0${relativePath}\0`);
    hash.update(readFileSync(path.join(packageRoot, relativePath)));
  }
  return hash.digest('hex');
}

function resolveVersion(liveProjectRoot, settings) {
  return toolVersions(
    createToolContext({ projectRoot: liveProjectRoot, liveRoot: liveProjectRoot, settings }),
  );
}

export function createPythonAnalyzer(settings = {}) {
  return {
    name: PYTHON_ANALYZER_NAME,
    version: UNRESOLVED_VERSION,
    resolveVersion: (liveProjectRoot) => resolveVersion(liveProjectRoot, settings),
    configurationHash: hashConfiguration(settings),
    exclusions: [],
    reportedTools: ['ruff', 'ruff-format', 'black', 'coverage', 'structure', 'crap'],
    timeoutMs: ANALYZER_TIMEOUT_MS,
    createInvocation({ projectRoot, toolRoot, liveProjectRoot }) {
      return {
        command: process.execPath,
        args: [
          runnerPath,
          '--project-root',
          projectRoot,
          '--live-root',
          liveProjectRoot,
          ...(Object.keys(settings).length === 0
            ? []
            : ['--python-settings', JSON.stringify(settings)]),
        ],
        cwd: toolRoot,
      };
    },
  };
}
