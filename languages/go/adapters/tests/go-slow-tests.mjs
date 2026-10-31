import path from 'node:path';
import {
  slowTestBudget,
  slowTestFindings,
} from '../../../../shared/rules/slow-tests/slow-test-finding.mjs';
import { moduleFileText, readGoModule } from '../execution/go-module.mjs';
import { execute } from '../execution/go-process.mjs';
import { buildFlags } from '../build/go-vet.mjs';
import { inspectBaseline } from '../structure/go-inspect.mjs';
import { parseTestEvents } from './test-events.mjs';

const SLOW_TEST_TOOL = 'test-runtime';
const INTEGRATION_FOLDERS = new Set(['integration', 'integration_tests', 'e2e', 'end_to_end']);
const INTEGRATION_FILE = /_(?:integration|e2e)_test\.go$/u;
const INTEGRATION_TAG = /^\/\/go:build\s.*(?<![!\w])(?:integration|e2e)\b/mu;
const SHORT_SKIP = /\btesting\.Short\(\)/u;
const RETIME_TIMEOUT_MS = 10 * 60 * 1000;

function packageDirectory(modulePath, importPath) {
  if (importPath === modulePath) {
    return '.';
  }
  return importPath.startsWith(`${modulePath}/`)
    ? importPath.slice(modulePath.length + 1)
    : undefined;
}

function functionText(root, { file, start, end }) {
  return moduleFileText(root, file)
    ?.split(/\r?\n/u)
    .slice(start - 1, end)
    .join('\n');
}

function testFunction(tests, directory, name) {
  return tests.find((test) => path.posix.dirname(test.file) === directory && test.name === name);
}

function isIntegration(projectRoot, test) {
  const folders = path.posix.dirname(test.file).split('/');
  const fileText = moduleFileText(projectRoot, test.file) ?? '';
  return (
    folders.some((folder) => INTEGRATION_FOLDERS.has(folder)) ||
    INTEGRATION_FILE.test(test.file) ||
    INTEGRATION_TAG.test(fileText) ||
    SHORT_SKIP.test(functionText(projectRoot, test) ?? '')
  );
}

function changedSince(context, test) {
  const base = inspectBaseline(context);
  if (base === undefined) {
    return true;
  }
  const previous = testFunction(base.tests, path.posix.dirname(test.file), test.name);
  return (
    previous === undefined ||
    functionText(context.baselineRoot, previous) !== functionText(context.projectRoot, test)
  );
}

function retimed(context, run) {
  const result = execute(
    context,
    [
      'go',
      'test',
      '-vet=off',
      '-json',
      '-count=1',
      ...buildFlags(context.settings),
      '-run',
      `^${run.name}$`,
      run.package,
    ],
    { timeout: RETIME_TIMEOUT_MS },
  );
  const again = parseTestEvents(result.stdout ?? '').tests.find(
    ({ name, outcome }) => name === run.name && outcome === 'passed',
  );
  return again === undefined ? run.seconds : Math.min(run.seconds, again.seconds);
}

function candidates(context, testRun, report) {
  const modulePath = readGoModule(context.projectRoot)?.module;
  const budget = slowTestBudget(context.testSeconds);
  const floor = Math.min(budget.unitTestSeconds, budget.integrationTestSeconds);
  return testRun.tests
    .filter(
      ({ name, outcome, seconds }) =>
        !name.includes('/') && outcome === 'passed' && seconds > floor,
    )
    .flatMap((run) => {
      const directory =
        modulePath === undefined ? undefined : packageDirectory(modulePath, run.package);
      const test =
        directory === undefined ? undefined : testFunction(report.tests, directory, run.name);
      return test === undefined
        ? []
        : [{ run, test, integration: isIntegration(context.projectRoot, test) }];
    })
    .filter(
      ({ run, integration }) =>
        run.seconds > (integration ? budget.integrationTestSeconds : budget.unitTestSeconds),
    )
    .filter(({ test }) => changedSince(context, test));
}

export function goSlowTestFindings(context, testRun, report) {
  if (context.snapshot === 'base') {
    return [];
  }
  return candidates(context, testRun, report).flatMap(({ run, test, integration }) =>
    slowTestFindings({
      tool: SLOW_TEST_TOOL,
      language: 'go',
      test: {
        path: test.file,
        name: test.name,
        identity: `test:${test.file}::${test.name}`,
        seconds: retimed(context, run),
        line: test.start,
      },
      integration,
      limits: context.testSeconds,
    }),
  );
}
