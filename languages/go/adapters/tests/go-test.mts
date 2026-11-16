import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { TESTS_FAILED_RULE, testsFailHeadline } from '../../../../shared/rules/finding-helpers.mjs';
import {
  failingTestEntries as untypedFailingTestEntries,
  valuesInMessage,
} from '../../../../shared/rules/failing-tests/failing-tests.mjs';
import { execute, failure } from '../execution/go-process.mts';
import { buildFlags } from '../build/go-vet.mts';
import {
  RACE_FLAGS,
  raceOnlyFailures,
  raceUnavailable,
  writeRaceCheck,
} from '../race/race-run.mts';
import { meaningfulLines, parseTestEvents } from './test-events.mts';
import type { FindingRow, GoContext, GoSettings, TestRun } from '../go-types.mts';

type Failure = TestRun['failures'][number];

const failingTestEntries: (entries: readonly object[]) => string[] = untypedFailingTestEntries;
const TEST_EVENTS = 'test-events.jsonl';
export const COVERAGE_PROFILE = 'coverage.out';
const TESTS_TOOL = 'tests';
const NO_TESTS_RULE = 'no-tests-ran';
const LISTED_TESTS = 20;
const OUTPUT_LINES = 8;

function testCommand(settings: GoSettings, reportRoot: string, race: boolean) {
  return [
    'go',
    'test',
    '-vet=off',
    '-json',
    ...(race ? RACE_FLAGS : []),
    ...buildFlags(settings),
    '-covermode=atomic',
    '-coverpkg=./...',
    `-coverprofile=${path.join(reportRoot, COVERAGE_PROFILE)}`,
    './...',
  ];
}

function runTests(context: GoContext, race: boolean) {
  const command = testCommand(context.settings, context.reportRoot, race);
  return { command, result: execute(context, command) };
}

export function goTest(context: GoContext): void {
  const raced = runTests(context, true);
  const reason = raceUnavailable(raced.result);
  const { command, result } = reason === undefined ? raced : runTests(context, false);
  const text = result.stdout ?? '';
  if (result.error !== undefined || (result.status !== 0 && parseTestEvents(text).events === 0)) {
    throw failure({ command, result, rule: 'go-test-failed' });
  }
  writeFileSync(path.join(context.reportRoot, TEST_EVENTS), text);
  writeRaceCheck(
    context,
    reason === undefined
      ? { checked: true, raceOnly: raceOnlyFailures(context, parseTestEvents(text)) }
      : { checked: false, reason },
  );
}

export function readTestRun(reportRoot: string): TestRun {
  return parseTestEvents(readFileSync(path.join(reportRoot, TEST_EVENTS), 'utf8'));
}

function failureLines({ id, output }: Failure) {
  const lines = meaningfulLines(output)
    .slice(0, OUTPUT_LINES)
    .map((line) => `    ${line}`);
  return [`  ${id}`, ...lines];
}

function listed(failures: readonly Failure[]) {
  const shown = failures.slice(0, LISTED_TESTS).flatMap(failureLines);
  const more = failures.length - LISTED_TESTS;
  return more > 0 ? [...shown, `  and ${String(more)} more`] : shown;
}

const OUTPUT_LOCATION = /^(?<file>\S+\.go):(?<line>\d+):(?<message>.*)$/u;

function locatedLine(lines: readonly string[]) {
  const located = lines
    .map((line) => OUTPUT_LOCATION.exec(line)?.groups)
    .filter((groups) => groups !== undefined)
    .map((groups) => ({
      file: groups['file'] ?? '',
      line: groups['line'] ?? '',
      message: (groups['message'] ?? '').trim(),
    }));
  return located.find(({ message }) => message !== '') ?? located[0];
}

function failureEntry({ id, output }: Failure) {
  const lines = meaningfulLines(output);
  const located = locatedLine(lines);
  const errorLine = lines
    .find((line) => line.startsWith('Error:'))
    ?.replace(/^Error:\s*/u, '')
    .replace(/:$/u, '');
  const message = located === undefined ? lines[0] : located.message || errorLine;
  return {
    name: id,
    ...(located === undefined ? {} : { file: located.file, line: Number(located.line) }),
    ...(message === undefined ? {} : { message }),
    ...valuesInMessage(output),
  };
}

function failuresMessage(failures: readonly Failure[], snapshot: string) {
  if (snapshot === 'base') {
    return [
      'Tests fail in the base snapshot. Make each failing test pass:',
      ...listed(failures),
      'The static analyzers ran as usual; coverage comes from the tests that ran.',
    ].join('\n');
  }
  const consequence = 'the static analyzers ran, and coverage comes from the tests that ran';
  return [
    testsFailHeadline(failures.length, consequence),
    ...failingTestEntries(failures.map(failureEntry)),
  ].join('\n');
}

export function testRunFindings(
  { failures, testsRan, buildFailures }: Pick<TestRun, 'failures' | 'testsRan' | 'buildFailures'>,
  snapshot = 'head',
): FindingRow[] {
  return [
    ...(failures.length === 0
      ? []
      : [
          {
            tool: TESTS_TOOL,
            rule: TESTS_FAILED_RULE,
            path: '.',
            identity: TESTS_FAILED_RULE,
            message: failuresMessage(failures, snapshot),
            classification: 'tool-error',
          },
        ]),
    ...(testsRan || buildFailures.length > 0
      ? []
      : [
          {
            tool: TESTS_TOOL,
            rule: NO_TESTS_RULE,
            path: '.',
            identity: NO_TESTS_RULE,
            message:
              'No tests ran. Keep the project tests, or restore the ones this change removed.',
            classification: 'enforceable',
          },
        ]),
  ];
}
