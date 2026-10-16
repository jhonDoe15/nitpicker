import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { RULE_IDS, TEST_TIME_DEFAULTS } from '../../../../shared/policy.mjs';
import { exceptionSentence } from '../../rules/rule-hints.mjs';
import { testFunction, testPath } from './test-functions.mjs';

export const TEST_RUN_TOOL = 'test-runtime';
const INTEGRATION_FOLDER = /^(?:integration|integration_tests|e2e|it)$/i;
const INTEGRATION_FILE = /(?:^|_)(?:integration|e2e)(?:_|\.py$)/i;
const INTEGRATION_MARKERS = new Set(['integration', 'e2e']);
const MOVE_ADVICE = ', or mark it `@pytest.mark.integration` if it is one';

export function readPytestReport(reportRoot, name) {
  const file = path.join(reportRoot, name);
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { tests: [], entries: [] };
}

export function projectRelative(projectRoot, file) {
  const relative = path.relative(projectRoot, file).split(path.sep).join('/');
  return file === '' || relative.startsWith('..') ? '.' : relative;
}

function readOptional(root, file) {
  const absolute = root === undefined ? undefined : path.join(root, file);
  return absolute !== undefined && existsSync(absolute)
    ? readFileSync(absolute, 'utf8')
    : undefined;
}

function slowestRuns(tests, projectRoot) {
  const byFunction = new Map();
  for (const test of tests) {
    const file = projectRelative(projectRoot, test.file);
    const key = `${file}::${testPath(test.test).join('::')}`;
    if ((byFunction.get(key)?.seconds ?? -1) < test.seconds) {
      byFunction.set(key, { ...test, file, key });
    }
  }
  return [...byFunction.values()];
}

function isIntegration({ file, markers = [] }) {
  const parts = file.split('/');
  return (
    parts.slice(0, -1).some((part) => INTEGRATION_FOLDER.test(part)) ||
    INTEGRATION_FILE.test(parts.at(-1)) ||
    markers.some((marker) => INTEGRATION_MARKERS.has(marker))
  );
}

function isChanged({ test, text, method }, baselineRoot) {
  const base = readOptional(baselineRoot, test.file);
  if (base === undefined || method === undefined) {
    return base !== text;
  }
  return testFunction(base, testPath(test.test))?.text !== method.text;
}

function slowTestFinding({ test, method, limit, integration }) {
  const kind = integration ? 'an integration' : 'a unit';
  return {
    tool: TEST_RUN_TOOL,
    rule: RULE_IDS.slowTest,
    path: test.file,
    identity: `test:${test.key}`,
    ...(method === undefined ? {} : { location: { line: method.line } }),
    message: [
      `${test.key} took ${test.seconds.toFixed(1)} s; ${kind} test may take ${String(limit)} s.`,
      `Remove \`time.sleep\` and other fixed waits, or give a costly fixture a wider scope (\`scope="module"\` or \`"session"\`)${integration ? '' : MOVE_ADVICE}.`,
      exceptionSentence(RULE_IDS.slowTest),
    ].join(' '),
    classification: 'enforceable',
  };
}

export function slowTestFindings(report, { projectRoot, policy = {} }) {
  if (policy.snapshot === 'base') {
    return [];
  }
  const budget = { ...TEST_TIME_DEFAULTS, ...policy.testSeconds };
  return slowestRuns(report.tests, projectRoot).flatMap((test) => {
    const integration = isIntegration(test);
    const limit = integration ? budget.integrationTestSeconds : budget.unitTestSeconds;
    if (test.seconds <= limit) {
      return [];
    }
    const text = readOptional(projectRoot, test.file);
    const method = text === undefined ? undefined : testFunction(text, testPath(test.test));
    const counted =
      policy.baselineRoot === undefined || isChanged({ test, text, method }, policy.baselineRoot);
    return counted ? [slowTestFinding({ test, method, limit, integration })] : [];
  });
}
