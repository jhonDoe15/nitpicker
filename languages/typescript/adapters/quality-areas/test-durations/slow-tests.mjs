import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ts } from '../../../typescript-api/typescript-api.mjs';
import { parseChangedLines } from '../../../../../core/diff/git/patches/changed-lines.mjs';
import { pathInside } from '../../../../../shared/filesystem.mjs';
import { RULE_IDS, TEST_TIME_DEFAULTS } from '../../../../../shared/policy.mjs';
import { exceptionHint, exceptionMatcher } from '../../../../../shared/rules/exceptions.mjs';
import { diffAgainstBase } from '../runners/mutation-scope.mjs';

const INTEGRATION_FOLDERS = ['integration', 'e2e'];
const MILLISECONDS = 1000;

export function changedTestLines(options) {
  if (options.baselineRoot === undefined) {
    return undefined;
  }
  const changed = parseChangedLines(diffAgainstBase(options, '--unified=0'));
  return new Map([...changed.values()].map((file) => [file.path, file.ranges]));
}

function isIntegrationTest(file, testRoots) {
  return testRoots.some((root) => {
    if (!file.startsWith(`${root}/`)) {
      return false;
    }
    const [folder] = file.slice(root.length + 1).split('/');
    return [path.posix.basename(root), folder].some((name) => INTEGRATION_FOLDERS.includes(name));
  });
}

function testCallSpans(projectRoot, file) {
  const full = pathInside(projectRoot, file);
  if (full === undefined) {
    return new Map();
  }
  const text = readFileSync(full, 'utf8');
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const nodes = [source];
  for (const node of nodes) {
    nodes.push(...node.getChildren(source));
  }
  return new Map(
    nodes.filter(ts.isCallExpression).map((call) => {
      const start = source.getLineAndCharacterOfPosition(call.getStart(source));
      const key = `${String(start.line + 1)}:${String(start.character + 1)}`;
      return [key, source.getLineAndCharacterOfPosition(call.end).line + 1];
    }),
  );
}

function isTouched({ ranges, spans }, location) {
  if (ranges === undefined) {
    return true;
  }
  const last = spans.get(`${String(location.line)}:${String(location.column)}`) ?? location.line;
  return ranges.some(([first, end]) => first <= last && end >= location.line);
}

function slowTestMessage({ file, seconds, budget, integration }) {
  const kind = integration ? 'an integration or e2e test' : 'a unit test';
  const move = integration
    ? ''
    : ' If it really is an integration test, move it to an `integration/` or `e2e/` folder of a test root.';
  return `This test took ${seconds.toFixed(1)} s; the budget for ${kind} is ${String(budget)} s. Replace real waits with fake timers (\`vi.useFakeTimers()\`) and use smaller fixtures.${move} ${exceptionHint(RULE_IDS.slowTest, file)}`;
}

function fileFindings(context, testResult) {
  const file = path.relative(context.projectRoot, testResult.name).replaceAll('\\', '/');
  const integration = isIntegrationTest(file, context.testRoots);
  const budget = integration
    ? context.limits.integrationTestSeconds
    : context.limits.unitTestSeconds;
  const slow = (testResult.assertionResults ?? []).filter(
    (test) =>
      typeof test.duration === 'number' && test.duration > budget * MILLISECONDS && test.location,
  );
  if (slow.length === 0) {
    return [];
  }
  const touched = {
    ranges: context.changedLines?.get(file),
    spans: testCallSpans(context.projectRoot, file),
  };
  if (context.changedLines !== undefined && touched.ranges === undefined) {
    return [];
  }
  return slow
    .filter((test) => isTouched(touched, test.location))
    .map((test) => ({
      tool: context.analyzerName,
      rule: RULE_IDS.slowTest,
      path: file,
      identity: `slow-test|${file}|${test.fullName}`,
      message: slowTestMessage({
        file,
        seconds: test.duration / MILLISECONDS,
        budget,
        integration,
      }),
      classification: 'enforceable',
      location: { line: test.location.line },
    }));
}

export function slowTestFindings(report, context) {
  const limits = { ...TEST_TIME_DEFAULTS, ...context.thresholds };
  const isExcepted = exceptionMatcher(context.exceptions ?? []);
  return (report.testResults ?? [])
    .flatMap((testResult) => fileFindings({ ...context, limits }, testResult))
    .filter(({ rule, path: file }) => !isExcepted(rule, file));
}
