import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { testCasesOf } from '../../java/adapters/test-times/slow-tests.mjs';
import {
  slowestRuns,
  slowTestBudget,
} from '../../../shared/rules/slow-tests/slow-test-finding.mjs';
import { execute } from '../adapters/execution/python-process.mjs';
import { isIntegrationTest } from './integration-tests.mjs';
import { factsOf, isChanged, isFile } from './test-facts.mjs';
import { RERUN_TIMES_REPORT, TEST_TIMES_REPORT, rerunCommand } from './timing-command.mjs';

export { timedCoverageCommand } from './timing-command.mjs';

export const SLOW_TESTS_REPORT = 'slow-tests.json';
const TEST_ROOTS = ['', 'tests', 'test'];
const PARAMETERS = /\[.*$/su;
const PYTHON_SUFFIX = /\.py$/u;
const NOT_TIMED =
  'The test run wrote no timing report, so slow tests were not checked ' +
  "(a project that disables pytest's JUnit report with -p no:junitxml is not timed)";

function runKey({ className, name }) {
  return `${className}#${name}`;
}

function fromFile(projectRoot, testCase) {
  if (testCase.file === undefined || !isFile(projectRoot, testCase.file)) {
    return undefined;
  }
  const module = testCase.file.replace(PYTHON_SUFFIX, '').replaceAll('/', '.');
  const inner = testCase.className.startsWith(`${module}.`)
    ? testCase.className.slice(module.length + 1)
    : '';
  return { file: testCase.file, classes: inner === '' ? [] : inner.split('.') };
}

function fromClassName(projectRoot, className) {
  const parts = className.split('.');
  return Array.from({ length: parts.length }, (_, index) => parts.length - index)
    .flatMap((count) =>
      TEST_ROOTS.map((folder) => ({
        file: `${[folder, ...parts.slice(0, count)].filter(Boolean).join('/')}.py`,
        classes: parts.slice(count),
      })),
    )
    .find(({ file }) => isFile(projectRoot, file));
}

function locate(projectRoot, testCase) {
  const found = fromFile(projectRoot, testCase) ?? fromClassName(projectRoot, testCase.className);
  const name = testCase.name.replace(PARAMETERS, '');
  return found === undefined
    ? undefined
    : { ...testCase, ...found, qualname: [...found.classes, name].join('.') };
}

function slowCases(context, xml) {
  const budget = slowTestBudget(context.testSeconds);
  const floor = Math.min(budget.unitTestSeconds, budget.integrationTestSeconds);
  return slowestRuns(
    testCasesOf(xml).filter((testCase) => testCase.seconds > floor),
    runKey,
  );
}

function recordOf({ test, head, roots, base }, runner) {
  const fact = head.facts[test.file]?.[test.qualname];
  const module = path.posix.basename(test.file, '.py');
  return {
    path: test.file,
    identity: `test:${test.className}#${test.name}`,
    name: `${[module, ...test.classes].join('.')} ${test.name}`,
    seconds: test.seconds,
    runner,
    ...(fact === undefined ? {} : { line: fact.line }),
    integration: isIntegrationTest({
      file: test.file,
      classes: test.classes,
      markers: fact?.markers ?? [],
    }),
    changed: isChanged({ test, head, base, roots }),
  };
}

function notice(file, message) {
  return { path: file, message };
}

function retimed(context, tests) {
  const launch = rerunCommand(context, tests);
  execute(context, launch);
  const report = path.join(context.reportRoot, RERUN_TIMES_REPORT);
  return new Map(
    existsSync(report)
      ? testCasesOf(readFileSync(report, 'utf8')).map((testCase) => [
          runKey(testCase),
          testCase.seconds,
        ])
      : [],
  );
}

function located(context, cases) {
  const found = cases.map((testCase) => ({
    testCase,
    test: locate(context.projectRoot, testCase),
  }));
  return {
    tests: found.flatMap(({ test }) => (test === undefined ? [] : [test])),
    notices: found
      .filter(({ test }) => test === undefined)
      .map(({ testCase }) =>
        notice(
          '.',
          `${testCase.className} ${testCase.name} took ${testCase.seconds.toFixed(1)} s, ` +
            'but its file was not found under the project root, so it is not checked for slow tests',
        ),
      ),
  };
}

function withFacts(context, tests) {
  const files = [...new Set(tests.map(({ file }) => file))];
  const roots = { projectRoot: context.projectRoot, baselineRoot: context.baselineRoot };
  const head = factsOf(context, context.projectRoot, files);
  const base =
    context.baselineRoot === undefined
      ? { facts: {} }
      : factsOf(context, context.baselineRoot, files);
  return { files, roots, head, base };
}

function entriesOf(context, tests) {
  const { files, roots, head, base } = withFacts(context, tests);
  const failed = head.error ?? base.error;
  if (failed !== undefined) {
    return {
      entries: [],
      notices: files.map((file) =>
        notice(file, `${file} is not checked for slow tests: reading its tests failed, ${failed}`),
      ),
    };
  }
  return {
    entries: tests.map((test) => ({
      test,
      record: recordOf({ test, head, base, roots }, context.project.testRunner),
    })),
    notices: [],
  };
}

function untimed(context, outcome) {
  const missing = !existsSync(path.join(context.reportRoot, TEST_TIMES_REPORT));
  return missing && outcome.testsRan === true ? [notice('.', NOT_TIMED)] : [];
}

export function collectSlowTests(context, outcome = {}) {
  if (context.snapshot === 'base') {
    return;
  }
  const times = path.join(context.reportRoot, TEST_TIMES_REPORT);
  const timed = existsSync(times)
    ? located(context, slowCases(context, readFileSync(times, 'utf8')))
    : { tests: [], notices: untimed(context, outcome) };
  const { entries, notices } = entriesOf(context, timed.tests);
  const counted = entries.filter(({ record }) => record.changed);
  const seconds =
    counted.length === 0
      ? new Map()
      : retimed(
          context,
          counted.map(({ test }) => test),
        );
  writeFileSync(
    path.join(context.reportRoot, SLOW_TESTS_REPORT),
    JSON.stringify({
      tests: counted.map(({ test, record }) => ({
        ...record,
        seconds: seconds.get(runKey(test)) ?? record.seconds,
      })),
      notices: [...timed.notices, ...notices],
    }),
  );
}
