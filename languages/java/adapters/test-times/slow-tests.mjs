import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { childrenNamed, parseXml } from '../../../../shared/ingest/common.mjs';
import { inModule } from '../../builds/module-path.mjs';
import { sourceLocator } from '../reporting/kotlin-reports.mjs';
import { MESSAGES, RULE_IDS, renderMessage } from '../../../../shared/policy.mjs';
import {
  shownSeconds,
  slowestRuns,
  slowTestBudget,
} from '../../../../shared/rules/slow-tests/slow-test-finding.mjs';
import { SLOW_TEST_FIXES } from '../../../../shared/rules/slow-tests/slow-test-fixes.mjs';
import { isSpringBootTest, sourceOf } from './spring-boot-tests.mjs';
import { inheritedMethod, superclassOf } from './inherited-tests.mjs';
import { templateMethods, testMethod } from './test-methods.mjs';

const SLOW_TEST_TOOL = 'test-runtime';
export const TEST_RESULTS_DIRECTORY = 'test-results';
const UNIT_TEST_TASKS = new Set(['test', 'surefire']);
const INTEGRATION_CLASS = /(?:IT|ITCase|IntegrationTests?|IntegrationSpec|ISpec)$/u;
const MOVE_ADVICE = {
  gradle: ', or move it to an integration test source set if it is one',
  maven: ', or make it an integration test that Failsafe runs (*IT) if it is one',
};
const MAVEN_TASKS = new Set(['surefire', 'failsafe']);

const NOT_TIMED_OUTCOMES = ['failure', 'error', 'skipped'];

export function testCasesOf(xml, task) {
  const root = parseXml(xml);
  const suites = root.name === 'testsuites' ? childrenNamed(root, 'testsuite') : [root];
  return suites.flatMap((suite) =>
    childrenNamed(suite, 'testcase')
      .filter((testCase) =>
        NOT_TIMED_OUTCOMES.every((name) => childrenNamed(testCase, name).length === 0),
      )
      .map((testCase) => ({
        task,
        file: testCase.attrs.file,
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

function readOptional(root, relative) {
  const file = relative === undefined ? undefined : path.join(root, relative);
  return file !== undefined && existsSync(file) ? readFileSync(file, 'utf8') : undefined;
}

function isIntegration(testCase, text, context) {
  const simple = testCase.className.split('.').pop().split('$')[0];
  return (
    !UNIT_TEST_TASKS.has(testCase.task) ||
    INTEGRATION_CLASS.test(simple) ||
    (text !== undefined && isSpringBootTest(text, context))
  );
}

function sameUnnamedCase(baseText, text, className) {
  const baseTemplates = templateMethods(baseText, className);
  const templates = templateMethods(text, className);
  return baseTemplates === '' && templates === '' ? baseText === text : baseTemplates === templates;
}

function sameTest(baseText, { testCase, method }) {
  if (method === undefined) {
    return sameUnnamedCase(baseText, testCase.text, testCase.className);
  }
  return testMethod(baseText, testCase.name, testCase.className)?.text === method.text;
}

function movedFrom(baselineRoot, { source, modulePath, testRoots, projectRoot }) {
  const name = path.basename(source);
  return testRoots.flatMap((root) => {
    const directory = path.join(baselineRoot, inModule(modulePath, root));
    return existsSync(directory)
      ? readdirSync(directory, { recursive: true })
          .filter((entry) => path.basename(entry) === name)
          .filter((entry) => !existsSync(path.join(projectRoot, root, entry)))
          .map((entry) => readFileSync(path.join(directory, entry), 'utf8'))
      : [];
  });
}

function inheritedChanged(slow, baselineRoot) {
  const { declaring, method, modulePath, testCase, text } = slow;
  const baseText = readOptional(baselineRoot, inModule(modulePath, slow.source));
  const owners = baseText === undefined ? movedFrom(baselineRoot, slow) : [baseText];
  const baseDeclaring = readOptional(baselineRoot, inModule(modulePath, declaring.source));
  return (
    !owners.some(
      (owner) => superclassOf(owner, testCase.className) === superclassOf(text, testCase.className),
    ) ||
    baseDeclaring === undefined ||
    testMethod(baseDeclaring, testCase.name, declaring.className)?.text !== method.text
  );
}

function isChanged(slow, baselineRoot) {
  const { source, text, modulePath } = slow;
  if (slow.declaring !== undefined) {
    return inheritedChanged(slow, baselineRoot);
  }
  const baseText = readOptional(baselineRoot, source && inModule(modulePath, source));
  if (text === undefined) {
    return baseText !== text;
  }
  const compared = { testCase: { ...slow.testCase, text }, method: slow.method };
  if (baseText !== undefined) {
    return !sameTest(baseText, compared);
  }
  return !movedFrom(baselineRoot, slow).some((moved) => sameTest(moved, compared));
}

function slowTestFinding({ testCase, method, limit, integration, modulePath, ...slow }) {
  const source = slow.declaring?.source ?? slow.source;
  const exception = JSON.stringify({
    rule: RULE_IDS.slowTest,
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
      name: `${testCase.className.split('.').pop().replaceAll('$', '.')} ${testCase.name}`,
      seconds: shownSeconds(testCase.seconds, limit),
      kind: integration ? 'an integration' : 'a unit',
      limit,
      fix: renderMessage(SLOW_TEST_FIXES.java, {
        move: integration ? '' : MOVE_ADVICE[MAVEN_TASKS.has(testCase.task) ? 'maven' : 'gradle'],
      }),
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
  const budget = slowTestBudget(limits);
  const locate = sourceLocator(projectRoot, testRoots);
  return slowestRuns(
    readTestCases(reportRoot),
    (testCase) => `${testCase.className}#${testCase.name}`,
  ).flatMap((testCase) => {
    const source = sourceOf(locate, testCase.className);
    const text = readOptional(projectRoot, source);
    const integration = isIntegration(testCase, text, { locate, projectRoot });
    const limit = integration ? budget.integrationTestSeconds : budget.unitTestSeconds;
    const own =
      text === undefined ? undefined : testMethod(text, testCase.name, testCase.className);
    const declaring =
      own === undefined && text !== undefined
        ? inheritedMethod({ text, testCase, locate, projectRoot })
        : undefined;
    const method = own ?? declaring?.method;
    const slow = { testCase, source, text, method, declaring, limit, integration, modulePath };
    Object.assign(slow, { testRoots, projectRoot });
    const counted = baseline?.baselineRoot === undefined || isChanged(slow, baseline.baselineRoot);
    return testCase.seconds > limit && counted ? [slowTestFinding(slow)] : [];
  });
}
