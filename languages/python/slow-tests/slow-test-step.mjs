import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { childrenNamed, parseXml } from '../../java/ingest/common.mjs';
import {
  slowestRuns,
  slowTestBudget,
} from '../../../shared/rules/slow-tests/slow-test-finding.mjs';
import { run } from '../adapters/execution/python-process.mjs';
import { isIntegrationTest } from './integration-tests.mjs';
import { TEST_TIMES_REPORT } from './timing-command.mjs';

export const SLOW_TESTS_REPORT = 'slow-tests.json';
const FACTS_SCRIPT = fileURLToPath(new URL('test_facts.py', import.meta.url));
const TEST_ROOTS = ['', 'tests', 'test'];
const PARAMETERS = /\[.*$/su;

function testCasesOf(xml) {
  const root = parseXml(xml);
  const suites = root.name === 'testsuites' ? childrenNamed(root, 'testsuite') : [root];
  return suites.flatMap((suite) =>
    childrenNamed(suite, 'testcase').map((testCase) => ({
      className: testCase.attrs.classname ?? '',
      name: testCase.attrs.name ?? '',
      seconds: Number(String(testCase.attrs.time ?? '0').replaceAll(',', '')),
    })),
  );
}

function locate(projectRoot, className) {
  const parts = className.split('.');
  for (let count = parts.length; count > 0; count -= 1) {
    for (const folder of TEST_ROOTS) {
      const file = `${path.posix.join(folder, ...parts.slice(0, count))}.py`;
      if (existsSync(path.join(projectRoot, file))) {
        return { file, classes: parts.slice(count) };
      }
    }
  }
  return undefined;
}

function factsOf(context, root, files) {
  const present = files.filter((file) => existsSync(path.join(root, file)));
  if (present.length === 0) {
    return {};
  }
  const { stdout } = run(context, ['python', '-I', FACTS_SCRIPT, root, ...present], {
    rule: 'slow-tests-failed',
  });
  return JSON.parse(stdout);
}

function textOf(root, file) {
  const absolute = root === undefined ? undefined : path.join(root, file);
  return absolute !== undefined && existsSync(absolute)
    ? readFileSync(absolute, 'utf8')
    : undefined;
}

function isChanged({ test, head, base, roots }) {
  if (roots.baselineRoot === undefined || base[test.file] === undefined) {
    return true;
  }
  const current = head[test.file]?.[test.qualname];
  return current === undefined
    ? textOf(roots.projectRoot, test.file) !== textOf(roots.baselineRoot, test.file)
    : base[test.file][test.qualname]?.hash !== current.hash;
}

function recordOf({ test, head, base, roots }) {
  const fact = head[test.file]?.[test.qualname];
  const module = path.posix.basename(test.file, '.py');
  return {
    path: test.file,
    identity: `test:${test.className}#${test.name}`,
    name: `${[module, ...test.classes].join('.')} ${test.name}`,
    seconds: test.seconds,
    ...(fact === undefined ? {} : { line: fact.line }),
    integration: isIntegrationTest({
      file: test.file,
      classes: test.classes,
      markers: fact?.markers ?? [],
    }),
    changed: isChanged({ test, head, base, roots }),
  };
}

function slowTests(context, xml) {
  const budget = slowTestBudget(context.testSeconds);
  const floor = Math.min(budget.unitTestSeconds, budget.integrationTestSeconds);
  const slowest = slowestRuns(
    testCasesOf(xml).filter((testCase) => testCase.seconds > floor),
    (testCase) => `${testCase.className}#${testCase.name}`,
  );
  return slowest.flatMap((testCase) => {
    const found = locate(context.projectRoot, testCase.className);
    const name = testCase.name.replace(PARAMETERS, '');
    return found === undefined
      ? []
      : [{ ...testCase, ...found, qualname: [...found.classes, name].join('.') }];
  });
}

export function collectSlowTests(context) {
  const times = path.join(context.reportRoot, TEST_TIMES_REPORT);
  if (context.snapshot === 'base' || !existsSync(times)) {
    return;
  }
  const tests = slowTests(context, readFileSync(times, 'utf8'));
  const files = [...new Set(tests.map(({ file }) => file))];
  const roots = { projectRoot: context.projectRoot, baselineRoot: context.baselineRoot };
  const head = factsOf(context, context.projectRoot, files);
  const base =
    context.baselineRoot === undefined ? {} : factsOf(context, context.baselineRoot, files);
  writeFileSync(
    path.join(context.reportRoot, SLOW_TESTS_REPORT),
    JSON.stringify(tests.map((test) => recordOf({ test, head, base, roots }))),
  );
}
