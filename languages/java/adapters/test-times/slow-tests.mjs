import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { childrenNamed, parseXml } from '../../ingest/common.mjs';
import { inModule } from '../../builds/module-path.mjs';
import { sourceLocator } from '../reporting/kotlin-reports.mjs';
import {
  MESSAGES,
  RULE_IDS,
  TEST_TIME_DEFAULTS,
  renderMessage,
} from '../../../../shared/policy.mjs';
import { testMethod } from './test-methods.mjs';

const SLOW_TEST_TOOL = 'test-runtime';
export const TEST_RESULTS_DIRECTORY = 'test-results';
const UNIT_TEST_TASKS = new Set(['test', 'surefire']);
const INTEGRATION_CLASS = /(?:IT|ITCase|IntegrationTests?)$/u;
const SPRING_BOOT_TEST = /@SpringBootTest\b/u;
const MOVE_ADVICE = ', or move it to an integration test source set if it is one';

export function testCasesOf(xml, task) {
  const root = parseXml(xml);
  const suites = root.name === 'testsuites' ? childrenNamed(root, 'testsuite') : [root];
  return suites.flatMap((suite) =>
    childrenNamed(suite, 'testcase').map((testCase) => ({
      task,
      className: testCase.attrs.classname ?? suite.attrs.name ?? '',
      name: testCase.attrs.name ?? '',
      seconds: Number(String(testCase.attrs.time ?? '0').replaceAll(',', '')),
    })),
  );
}

function readTestCases(reportRoot) {
  const resultsRoot = path.join(reportRoot, TEST_RESULTS_DIRECTORY);
  const tasks = existsSync(resultsRoot) ? readdirSync(resultsRoot).sort() : [];
  return tasks.flatMap((task) =>
    readdirSync(path.join(resultsRoot, task))
      .filter((name) => name.endsWith('.xml'))
      .sort()
      .flatMap((name) =>
        testCasesOf(readFileSync(path.join(resultsRoot, task, name), 'utf8'), task),
      ),
  );
}

function slowestRuns(testCases) {
  const byKey = new Map();
  for (const testCase of testCases) {
    const key = `${testCase.className}#${testCase.name}`;
    if ((byKey.get(key)?.seconds ?? -1) < testCase.seconds) {
      byKey.set(key, testCase);
    }
  }
  return [...byKey.values()];
}

function sourceOf(locate, className) {
  const parts = className.split('.');
  const simple = parts.pop().split('$')[0];
  const directory = parts.join('/');
  return locate(directory, `${simple}.java`) ?? locate(directory, `${simple}.kt`);
}

function readOptional(root, relative) {
  const file = relative === undefined ? undefined : path.join(root, relative);
  return file !== undefined && existsSync(file) ? readFileSync(file, 'utf8') : undefined;
}

function isIntegration(testCase, text) {
  const simple = testCase.className.split('.').pop().split('$')[0];
  return (
    !UNIT_TEST_TASKS.has(testCase.task) ||
    INTEGRATION_CLASS.test(simple) ||
    SPRING_BOOT_TEST.test(text ?? '')
  );
}

function isChanged({ testCase, source, text, method, modulePath }, baselineRoot) {
  const baseText = readOptional(baselineRoot, source && inModule(modulePath, source));
  if (baseText === undefined || method === undefined) {
    return baseText !== text;
  }
  return testMethod(baseText, testCase.name)?.text !== method.text;
}

function slowTestFinding({ testCase, source, method, limit, integration, modulePath }) {
  const exception = JSON.stringify({
    rule: `${SLOW_TEST_TOOL}/${RULE_IDS.slowTest}`,
    paths: [inModule(modulePath, source ?? '.')],
    reason: '...',
  });
  return {
    tool: SLOW_TEST_TOOL,
    rule: RULE_IDS.slowTest,
    path: source ?? '.',
    identity: `test:${testCase.className}#${testCase.name}`,
    ...(method === undefined ? {} : { location: { line: method.line } }),
    message: renderMessage(MESSAGES.slowTest, {
      name: `${testCase.className.split('.').pop()} ${testCase.name}`,
      seconds: testCase.seconds.toFixed(1),
      kind: integration ? 'an integration' : 'a unit',
      limit,
      move: integration ? '' : MOVE_ADVICE,
      exception,
    }),
    classification: 'enforceable',
  };
}

export function readSlowTestFindings(options) {
  const { reportRoot, projectRoot, testRoots, limits, baseline, modulePath } = options;
  if (baseline?.snapshot === 'base') {
    return [];
  }
  const budget = { ...TEST_TIME_DEFAULTS, ...limits };
  const locate = sourceLocator(projectRoot, testRoots);
  return slowestRuns(readTestCases(reportRoot)).flatMap((testCase) => {
    const source = sourceOf(locate, testCase.className);
    const text = readOptional(projectRoot, source);
    const integration = isIntegration(testCase, text);
    const limit = integration ? budget.integrationTestSeconds : budget.unitTestSeconds;
    const method = text === undefined ? undefined : testMethod(text, testCase.name);
    const slow = { testCase, source, text, method, limit, integration, modulePath };
    const counted = baseline?.baselineRoot === undefined || isChanged(slow, baseline.baselineRoot);
    return testCase.seconds > limit && counted ? [slowTestFinding(slow)] : [];
  });
}
