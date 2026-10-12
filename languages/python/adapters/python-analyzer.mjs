import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { createToolContext, toolVersions } from './python-tools.mjs';

export const PYTHON_ANALYZER_NAME = 'python';
const UNRESOLVED_VERSION = 'unresolved';
const ANALYZER_TIMEOUT_MS = 30 * 60 * 1000;
const packageRoot = path.resolve(import.meta.dirname, '../../..');
const pythonRoot = path.join(packageRoot, 'languages/python');
const runnerPath = path.join(import.meta.dirname, 'python-runner.mjs');
const SHARED_CONFIGURATION_FILES = [
  'languages/java/adapters/java-policy.mjs',
  'languages/java/adapters/java-reports.mjs',
  'languages/java/adapters/java-runner.mjs',
  'languages/java/ingest/common.mjs',
  'languages/java/ingest/format-check.mjs',
  'languages/java/ingest/sarif.mjs',
  'shared/glob.mjs',
  'shared/legacy-inventory.mjs',
  'shared/policy.mjs',
  'shared/rules/baseline-expansion.mjs',
  'shared/rules/branch-coverage.mjs',
  'shared/rules/finding-helpers.mjs',
];

function pythonConfigurationFiles() {
  return readdirSync(pythonRoot, { recursive: true })
    .filter((file) => !file.endsWith('.test.mjs') && !file.split(path.sep).includes('fixtures'))
    .filter((file) => path.extname(file) !== '')
    .sort()
    .map((file) => path.join('languages/python', file));
}

function hashConfiguration(settings) {
  const hash = createHash('sha256').update(JSON.stringify(settings));
  for (const relativePath of [...pythonConfigurationFiles(), ...SHARED_CONFIGURATION_FILES]) {
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
    reportedTools: ['ruff', 'ruff-format', 'black', 'coverage', 'coverage-py'],
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
