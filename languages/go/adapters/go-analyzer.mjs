import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { importClosure } from '../../../shared/import-closure.mjs';
import { toolVersions } from './execution/go-tools.mjs';

export const GO_ANALYZER_NAME = 'go';
const ANALYZER_TIMEOUT_MS = 30 * 60 * 1000;
const packageRoot = path.resolve(import.meta.dirname, '../../..');
const goRoot = path.join(packageRoot, 'languages/go');
const cliPath = path.join(packageRoot, 'core/cli.mjs');
const runnerPath = path.join(import.meta.dirname, 'go-runner.mjs');
const TEST_ONLY_FOLDERS = new Set(['fixtures', 'test-support']);
const TEST_FILE = /(?:\.test\.mjs|_test\.go)$/u;

function goResourceFiles() {
  return readdirSync(goRoot, { recursive: true })
    .filter((file) => !TEST_FILE.test(file))
    .filter((file) => !file.split(path.sep).some((folder) => TEST_ONLY_FOLDERS.has(folder)))
    .filter((file) => path.extname(file) !== '')
    .map((file) => path.join(goRoot, file));
}

function configurationFiles() {
  const entry = path.relative(packageRoot, runnerPath);
  const imported = [...importClosure([entry], packageRoot).keys()].map((file) =>
    path.join(packageRoot, file),
  );
  return [...new Set([...goResourceFiles(), ...imported])]
    .map((file) => path.relative(packageRoot, file))
    .sort();
}

function hashConfiguration(settings) {
  const hash = createHash('sha256').update(JSON.stringify(settings));
  for (const relativePath of configurationFiles()) {
    hash.update(`\0${relativePath}\0`);
    hash.update(readFileSync(path.join(packageRoot, relativePath)));
  }
  return hash.digest('hex');
}

function goVersion(liveProjectRoot) {
  const result = spawnSync('go', ['version'], { cwd: liveProjectRoot, encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : 'go missing';
}

export function createGoAnalyzer(settings = {}) {
  return {
    name: GO_ANALYZER_NAME,
    version: 'unresolved',
    resolveVersion: (liveProjectRoot) => [goVersion(liveProjectRoot), ...toolVersions()].join(' '),
    configurationHash: hashConfiguration(settings),
    exclusions: [],
    reportedTools: [
      'gofmt',
      'gofumpt',
      'goimports',
      'vet',
      'build',
      'tests',
      'test-runtime',
      'structure',
    ],
    timeoutMs: ANALYZER_TIMEOUT_MS,
    createInvocation: ({ projectRoot, toolRoot }) => ({
      command: process.execPath,
      args: [
        cliPath,
        'go-analyzer',
        '--project-root',
        projectRoot,
        ...(Object.keys(settings).length === 0 ? [] : ['--go-settings', JSON.stringify(settings)]),
      ],
      cwd: toolRoot,
    }),
  };
}
