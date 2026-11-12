import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { buildFlags } from '../build/go-vet.mjs';
import { execute } from '../execution/go-process.mjs';
import { parseEventLines, parseTestEvents } from '../tests/test-events.mjs';

const RACE_REPORT = 'race.json';
export const RACE_FLAGS = ['-race', '-covermode=atomic'];
const UNSUPPORTED = /-race requires cgo|-race is not supported on (?<platform>\S+)/u;
const SANITIZER_FATAL = /FATAL: ThreadSanitizer[^\n]*/u;
const RACE_RUNTIME = new Set(['runtime/cgo', 'runtime/race']);
const RERUN_TIMEOUT_MS = 10 * 60 * 1000;
const SLOWDOWN_FAILURE =
  /panic: test timed out|race: limit on \d+ simultaneously alive goroutines|signal: killed/u;

function runtimeBuildOutput(text) {
  return parseEventLines(text)
    .filter(({ Action, ImportPath }) => Action === 'build-output' && RACE_RUNTIME.has(ImportPath))
    .map(({ Output }) => (Output ?? '').trim())
    .filter((line) => line !== '' && !line.startsWith('#'));
}

function interrupted(error) {
  return error.code === 'ETIMEDOUT'
    ? 'go test -race ran past the time limit, so the tests ran again without it.'
    : `go test -race could not finish (${error.message}), so the tests ran again without it.`;
}

export function raceUnavailable({ stdout = '', stderr = '', error }) {
  if (error !== undefined) {
    return interrupted(error);
  }
  const unsupported = UNSUPPORTED.exec(stderr);
  if (unsupported !== null) {
    return unsupported.groups.platform === undefined
      ? 'go test -race needs cgo, which is off (CGO_ENABLED=0, or Go found no C compiler).'
      : `the race detector does not support ${unsupported.groups.platform}.`;
  }
  const sanitizer = SANITIZER_FATAL.exec(`${stderr}\n${stdout}`);
  if (sanitizer !== null) {
    return `the race detector cannot run on this machine: ${sanitizer[0].replaceAll('\\n', '').trim()}.`;
  }
  const runtime = runtimeBuildOutput(stdout);
  return runtime.length === 0
    ? undefined
    : `the race detector runtime did not build: ${runtime.join('; ')}.`;
}

function topLevelName(failure) {
  return failure.id.slice(failure.package.length + 1).split('/')[0];
}

function byName(left, right) {
  return left.localeCompare(right);
}

function rerunCommand(settings, failures) {
  const packages = [...new Set(failures.map((failure) => failure.package))].toSorted(byName);
  const names = [
    ...new Set(failures.filter(({ id, package: name }) => id !== name).map(topLevelName)),
  ].toSorted(byName);
  const whole = failures.some(({ id, package: name }) => id === name);
  return [
    'go',
    'test',
    '-vet=off',
    '-json',
    '-count=1',
    ...buildFlags(settings),
    ...(whole ? [] : ['-run', `^(?:${names.join('|')})$`]),
    ...packages,
  ];
}

function passedWithoutRace(failure, rerun) {
  if (failure.id === failure.package) {
    return !rerun.failures.some(({ package: name }) => name === failure.package);
  }
  return rerun.tests.some(
    ({ package: name, name: test, outcome }) =>
      name === failure.package && failure.id === `${name}.${test}` && outcome === 'passed',
  );
}

function suspectFailures(testRun) {
  const raced = new Set(testRun.raceOutputs.map(({ package: name }) => name));
  const slowed = new Set(
    testRun.failures
      .filter(({ output }) => SLOWDOWN_FAILURE.test(output))
      .map(({ package: name }) => name),
  );
  return testRun.failures.filter(({ package: name }) => raced.has(name) || slowed.has(name));
}

export function raceOnlyFailures(context, testRun) {
  const suspects = suspectFailures(testRun);
  if (suspects.length === 0) {
    return [];
  }
  const result = execute(context, rerunCommand(context.settings, suspects), {
    timeout: RERUN_TIMEOUT_MS,
  });
  const rerun = parseTestEvents(result.stdout ?? '');
  if (result.error !== undefined || rerun.events === 0) {
    return [];
  }
  return suspects
    .filter((failure) => passedWithoutRace(failure, rerun))
    .map(({ id, package: name }) => ({ id, package: name }));
}

export function writeRaceCheck(context, check) {
  writeFileSync(path.join(context.reportRoot, RACE_REPORT), JSON.stringify(check));
}

export function readRaceCheck(reportRoot) {
  return JSON.parse(readFileSync(path.join(reportRoot, RACE_REPORT), 'utf8'));
}
