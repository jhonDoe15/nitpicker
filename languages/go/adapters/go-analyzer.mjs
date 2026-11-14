import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { importClosure } from '../../../shared/import-closure.mjs';
import { toolVersions } from './execution/go-tools.mjs';
import { GO_LINTER_TOOLS } from './configuration/go-config.mjs';
import { PROBE_TIMEOUT_MS } from '../../../shared/processes/deadlines.mjs';
import { checkoutModulePath } from '../../../shared/paths/checkout-module.mjs';
import { EXECUTION_INPUTS } from '../../../shared/input-sets/inputs.mjs';

export const GO_ANALYZER_NAME = 'go';
export const GO_MUTATION_ANALYZER_NAME = 'mutation';
const MUTATION_TIMEOUT_MS = 70 * 60 * 1000;
const MUTATION_SHARD_WEIGHT = 90;
const ANALYZER_TIMEOUT_MS = 30 * 60 * 1000;
const packageRoot = path.resolve(import.meta.dirname, '../../..');
const goRoot = path.join(packageRoot, 'languages/go');
const cliPath = checkoutModulePath(path.join(packageRoot, 'core/cli.mjs'));
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

function probe(liveProjectRoot, args) {
  const result = spawnSync('go', args, {
    cwd: liveProjectRoot,
    encoding: 'utf8',
    timeout: PROBE_TIMEOUT_MS,
  });
  return result.status === 0 ? result.stdout.trim() : undefined;
}

function goVersion(liveProjectRoot) {
  const version = probe(liveProjectRoot, ['version']);
  if (version === undefined) {
    return 'go missing';
  }
  const cgo = probe(liveProjectRoot, ['env', 'CGO_ENABLED', 'CC'])?.split(/\s+/u).join('/');
  return `${version} cgo=${cgo ?? 'unknown'}`;
}

function goInvocation(settings, part) {
  return ({ projectRoot, toolRoot, baselineMovesFile }) => ({
    command: process.execPath,
    args: [
      cliPath,
      'go-analyzer',
      '--project-root',
      projectRoot,
      ...(part === GO_ANALYZER_NAME ? [] : ['--part', part]),
      ...(Object.keys(settings).length === 0 ? [] : ['--go-settings', JSON.stringify(settings)]),
      ...(baselineMovesFile === undefined ? [] : ['--baseline-moves-file', baselineMovesFile]),
    ],
    cwd: toolRoot,
  });
}

function resolveGoVersion(liveProjectRoot) {
  return [goVersion(liveProjectRoot), ...toolVersions()].join(' ');
}

function createGoAnalyzer(settings) {
  return {
    name: GO_ANALYZER_NAME,
    inputs: EXECUTION_INPUTS,
    version: 'unresolved',
    resolveVersion: resolveGoVersion,
    configurationHash: hashConfiguration(settings),
    exclusions: [],
    reportedTools: [
      'gofmt',
      'gofumpt',
      'goimports',
      ...GO_LINTER_TOOLS,
      'build',
      'tests',
      'race',
      'test-runtime',
      'coverage',
      'crap',
      'structure',
      'duplicates',
      'coupling',
      'entry-points',
      'facts',
      'deadcode',
      'dependencies',
    ],
    timeoutMs: ANALYZER_TIMEOUT_MS,
    createInvocation: goInvocation(settings, GO_ANALYZER_NAME),
  };
}

function createGoMutationAnalyzer(settings) {
  return {
    name: GO_MUTATION_ANALYZER_NAME,
    inputs: EXECUTION_INPUTS,
    version: 'unresolved',
    resolveVersion: resolveGoVersion,
    configurationHash: hashConfiguration({ ...settings, part: GO_MUTATION_ANALYZER_NAME }),
    exclusions: [],
    reportedTools: [GO_MUTATION_ANALYZER_NAME],
    dependencies: [GO_ANALYZER_NAME],
    toleratedDependencyErrors: ['tests', 'test-runtime'],
    shardWeight: MUTATION_SHARD_WEIGHT,
    timeoutMs: MUTATION_TIMEOUT_MS,
    createInvocation: goInvocation(settings, GO_MUTATION_ANALYZER_NAME),
  };
}

export function createGoAnalyzers(settings = {}) {
  return [createGoAnalyzer(settings), createGoMutationAnalyzer(settings)];
}
