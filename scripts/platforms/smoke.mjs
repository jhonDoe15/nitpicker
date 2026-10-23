import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { createSampleRepository, inside, REPOSITORY_ROOT } from './samples.mjs';

const CLI = path.join(REPOSITORY_ROOT, 'core/cli.mjs');
const RUN_TIMEOUT_MS = 60 * 60 * 1000;
const RUNTIMES = {
  node: () => [process.execPath],
  deno: () => ['deno', 'run', '-A'],
};

function slashed(text) {
  return String(text ?? '').replaceAll('\\', '/');
}

export function findingKey({ tool, rule, path: file, identity, classification }) {
  return JSON.stringify([tool, rule, slashed(file), slashed(identity), classification]);
}

export function toolErrorKey({ snapshot, tool, rule }) {
  return JSON.stringify([snapshot, tool, rule ?? 'crash']);
}

function readReport(directory, name) {
  const file = inside(directory, name);
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : [];
}

export function normalizedRun({ exitCode, reports, findingsFile }) {
  const toolErrors = readReport(reports, 'tool-errors.json');
  return {
    exitCode,
    findings: readReport(reports, findingsFile).map(findingKey).toSorted(),
    toolErrors: toolErrors.map(toolErrorKey).toSorted(),
    toolErrorMessages: toolErrors.map((error) => `${toolErrorKey(error)}: ${error.message}`),
  };
}

function runNitpicker(runtime, root, args) {
  const [command, ...prefix] = RUNTIMES[runtime]();
  const result = spawnSync(command, [...prefix, CLI, ...args], {
    cwd: root,
    stdio: 'inherit',
    timeout: RUN_TIMEOUT_MS,
  });
  if (result.error !== undefined) {
    throw result.error;
  }
  return result.status;
}

export function runSample(sample, runtime) {
  const repository = createSampleRepository(sample);
  try {
    const allReports = path.join(repository.root, 'reports/all');
    const all = runNitpicker(runtime, repository.root, ['--all', '--output', allReports]);
    repository.change();
    const changeReports = path.join(repository.root, 'reports/change');
    const change = runNitpicker(runtime, repository.root, [
      '--base',
      'main',
      '--output',
      changeReports,
    ]);
    return {
      sample,
      runtime,
      platform: process.platform,
      all: normalizedRun({ exitCode: all, reports: allReports, findingsFile: 'findings.json' }),
      change: normalizedRun({
        exitCode: change,
        reports: changeReports,
        findingsFile: 'new-findings.json',
      }),
    };
  } finally {
    repository.remove();
  }
}

function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      output: { type: 'string', default: 'reports/platforms' },
      runtime: { type: 'string', default: 'node' },
    },
  });
  if (!Object.hasOwn(RUNTIMES, values.runtime)) {
    throw new Error(`Unknown runtime ${values.runtime}; choose one of ${Object.keys(RUNTIMES)}`);
  }
  mkdirSync(values.output, { recursive: true });
  for (const sample of positionals) {
    const run = runSample(sample, values.runtime);
    writeFileSync(path.join(values.output, `${sample}.json`), `${JSON.stringify(run, null, 2)}\n`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  main();
}
