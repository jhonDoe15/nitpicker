import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { TESTS_FAILED_RULE } from '../../../../shared/rules/finding-helpers.mjs';
import { ANY_STATUS, failure, run } from '../execution/go-process.mjs';
import { buildFlags } from '../build/go-vet.mjs';
import { parseTestEvents } from './test-events.mjs';

const TEST_EVENTS = 'test-events.jsonl';
const COVERAGE_PROFILE = 'coverage.out';
const TESTS_TOOL = 'tests';
const NO_TESTS_RULE = 'no-tests-ran';
const LISTED_TESTS = 20;
const OUTPUT_LINES = 8;

function testCommand(settings, reportRoot) {
  return [
    'go',
    'test',
    '-vet=off',
    '-json',
    ...buildFlags(settings),
    '-coverpkg=./...',
    `-coverprofile=${path.join(reportRoot, COVERAGE_PROFILE)}`,
    './...',
  ];
}

export function goTest(context) {
  const command = testCommand(context.settings, context.reportRoot);
  const result = run(context, command, { rule: 'go-test-failed', accepted: ANY_STATUS });
  const text = result.stdout ?? '';
  if (result.status !== 0 && parseTestEvents(text).events === 0) {
    throw failure({ command, result, rule: 'go-test-failed' });
  }
  writeFileSync(path.join(context.reportRoot, TEST_EVENTS), text);
}

export function readTestRun(reportRoot) {
  return parseTestEvents(readFileSync(path.join(reportRoot, TEST_EVENTS), 'utf8'));
}

function failureLines({ id, output }) {
  const lines = output
    .split(/\r?\n/u)
    .filter((line) => line.trim() !== '' && !/^(?:=== |--- |FAIL\b|ok\b|PASS$)/u.test(line.trim()))
    .slice(0, OUTPUT_LINES)
    .map((line) => `    ${line.trim()}`);
  return [`  ${id}`, ...lines];
}

function listed(failures) {
  const shown = failures.slice(0, LISTED_TESTS).flatMap(failureLines);
  const more = failures.length - LISTED_TESTS;
  return more > 0 ? [...shown, `  and ${String(more)} more`] : shown;
}

export function testRunFindings({ failures, testsRan, buildFailures }, snapshot = 'head') {
  return [
    ...(failures.length === 0
      ? []
      : [
          {
            tool: TESTS_TOOL,
            rule: TESTS_FAILED_RULE,
            path: '.',
            identity: TESTS_FAILED_RULE,
            message: [
              `Tests fail in the ${snapshot} snapshot. Make each failing test pass:`,
              ...listed(failures),
              'The static analyzers ran as usual; coverage comes from the tests that ran.',
            ].join('\n'),
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
