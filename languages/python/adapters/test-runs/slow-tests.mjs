import { existsSync } from 'node:fs';
import path from 'node:path';
import {
  slowTestBudget,
  slowTestFindings,
} from '../../../../shared/rules/slow-tests/slow-test-finding.mjs';
import { insideProject, readProjectFile } from '../../libraries/project-files.mjs';
import { listOtherModules } from '../analysis/python-sources.mjs';
import { JUNIT_REPORT, RERUN_REPORT, readJunit } from './junit-results.mjs';
import { classHeader, functionBlocks, mentions, withoutParamCalls } from './python-blocks.mjs';

const SLOW_TEST_TOOL = 'test-runtime';
const INTEGRATION_FOLDERS = new Set(['integration', 'integration_tests', 'e2e', 'end_to_end']);
const INTEGRATION_MARKS = new Set(['integration', 'e2e']);
const INTEGRATION_MARK = /\bmark\s*\.\s*(?:integration|e2e)\b/u;
const NOT_TIMED =
  'The test run wrote no timing report, so slow tests were not checked ' +
  '(a project that disables the JUnit report is not timed)';

function readText(root, file) {
  return root === undefined || file === '' ? undefined : readProjectFile(root, file);
}

function exists(root, file) {
  return existsSync(insideProject(root, file));
}

function collectedFrom(projectRoot, testCase) {
  const parts = testCase.qualifiedClass.split('.').filter(Boolean);
  const size = parts.findLastIndex((_, index) =>
    exists(projectRoot, `${parts.slice(0, index + 1).join('/')}.py`),
  );
  return size === -1
    ? { file: testCase.file, className: testCase.className }
    : {
        file: `${parts.slice(0, size + 1).join('/')}.py`,
        className: parts.slice(size + 1).join('.'),
      };
}

function isIntegration(testCase, block) {
  const folders = path.posix.dirname(testCase.file).split('/');
  const marked =
    testCase.marks === undefined
      ? (block?.marks ?? []).some((mark) => INTEGRATION_MARK.test(withoutParamCalls(mark)))
      : testCase.marks.some((mark) => INTEGRATION_MARKS.has(mark));
  return marked || folders.some((folder) => INTEGRATION_FOLDERS.has(folder));
}

function headBlock(text, testCase, owner) {
  const blocks = text === undefined ? [] : functionBlocks(text);
  const index = (testCase.line ?? 0) - 1;
  const atLine = blocks.filter(({ first, definition }) => index >= first && index <= definition);
  return (
    atLine.find(({ name }) => name === testCase.functionName) ??
    atLine[0] ??
    blocks.find(({ name, owner: scope }) => name === testCase.functionName && scope === owner)
  );
}

function hasBlock(text, block) {
  return (
    text !== undefined &&
    functionBlocks(text, block.name).some(
      ({ owner, text: base }) => owner === block.owner && base === block.text,
    )
  );
}

function baseTestFiles(baselineRoot) {
  return listOtherModules(baselineRoot, [], [])
    .filter(({ kind }) => kind === 'test')
    .map(({ file }) => file);
}

function sameList(left, right) {
  return left.length === right.length && left.every((entry, index) => entry === right[index]);
}

function changeReader({ baselineRoot, projectRoot }) {
  let movedAway;
  function baseHas(file, matches) {
    if (matches(readText(baselineRoot, file))) {
      return true;
    }
    movedAway ??= baseTestFiles(baselineRoot).filter((other) => !exists(projectRoot, other));
    return movedAway.some((other) => other !== file && matches(readText(baselineRoot, other)));
  }
  function classKept({ file, className }) {
    const header = classHeader(readText(projectRoot, file) ?? '', className);
    return baseHas(file, (text) => text !== undefined && classHeader(text, className) === header);
  }
  function namesKept({ file }, name) {
    const head = mentions(readText(projectRoot, file) ?? '', name);
    return baseHas(file, (text) => text !== undefined && sameList(mentions(text, name), head));
  }
  return ({ testCase, block, collected }) => {
    const named = block?.name === testCase.functionName;
    const inherited = named && block.owner !== collected.className;
    return (
      (block !== undefined && !baseHas(testCase.file, (text) => hasBlock(text, block))) ||
      ((inherited || !named) && collected.className !== '' && !classKept(collected)) ||
      (!named && !namesKept(collected, testCase.functionName))
    );
  };
}

function measured(projectRoot, budget) {
  return (testCase) => {
    const collected = collectedFrom(projectRoot, testCase);
    const block = headBlock(readText(projectRoot, testCase.file), testCase, collected.className);
    const integration = isIntegration(testCase, block);
    const limit = integration ? budget.integrationTestSeconds : budget.unitTestSeconds;
    return { testCase, collected, block, integration, limit };
  };
}

function keyOf({ testCase, collected }) {
  return `${collected.file}::${collected.className}::${testCase.functionName}`;
}

function slowestRuns(runs) {
  const byTest = new Map();
  for (const run of runs) {
    if ((byTest.get(keyOf(run))?.testCase.seconds ?? -1) < run.testCase.seconds) {
      byTest.set(keyOf(run), run);
    }
  }
  return [...byTest.values()];
}

function notice(file, message) {
  return {
    tool: SLOW_TEST_TOOL,
    rule: 'slow-test-not-timed',
    path: file,
    identity: `slow-test-not-timed:${file}`,
    message,
    classification: 'descriptive',
  };
}

function unreadable(file, error) {
  const reason = error instanceof Error ? error.message : String(error);
  return notice(file, `${file} is not checked for slow tests: reading its tests failed, ${reason}`);
}

function safely(testCase, step) {
  try {
    return { value: step() };
  } catch (error) {
    return { notice: unreadable(testCase.file, error) };
  }
}

export function slowCandidates(options) {
  const { reportRoot, projectRoot, limits, baselineRoot } = options;
  const budget = slowTestBudget(limits);
  const floor = Math.min(budget.unitTestSeconds, budget.integrationTestSeconds);
  const isChanged =
    baselineRoot === undefined ? () => true : changeReader({ baselineRoot, projectRoot });
  const tried = readJunit(reportRoot)
    .filter(
      ({ name, seconds, outcome }) => name !== undefined && seconds > floor && outcome === 'passed',
    )
    .map((testCase) => ({
      testCase,
      ...safely(testCase, () => measured(projectRoot, budget)(testCase)),
    }));
  const over = slowestRuns(
    tried
      .filter(({ value }) => value !== undefined && value.testCase.seconds > value.limit)
      .map(({ value }) => value),
  );
  const checked = over.map((run) => ({ run, ...safely(run.testCase, () => isChanged(run)) }));
  return {
    runs: checked.filter(({ value }) => value === true).map(({ run }) => run),
    notices: [...tried, ...checked].flatMap((entry) =>
      entry.notice === undefined ? [] : [entry.notice],
    ),
  };
}

function retimes(reportRoot) {
  return new Map(
    readJunit(reportRoot, RERUN_REPORT)
      .filter(({ outcome }) => outcome === 'passed')
      .map(({ id, seconds }) => [id, seconds]),
  );
}

function slowTestFinding(run, options) {
  const { testCase, collected, block, integration } = run;
  return slowTestFindings({
    tool: SLOW_TEST_TOOL,
    language: 'python',
    advice: options.testRunner === 'unittest' ? 'unittest' : 'pytest',
    test: {
      path: testCase.file,
      name: [collected.className, testCase.functionName].filter(Boolean).join('.'),
      identity: `test:${keyOf(run)}`,
      seconds: testCase.seconds,
      ...(block === undefined ? {} : { line: block.definition + 1 }),
    },
    integration,
    limits: options.limits,
  });
}

function untimed({ reportRoot, testsRan }) {
  const missing = !existsSync(path.join(reportRoot, JUNIT_REPORT));
  return missing && testsRan === true ? [notice('.', NOT_TIMED)] : [];
}

function findingsOf(options) {
  const { runs, notices } = slowCandidates(options);
  const times = retimes(options.reportRoot);
  const retimed = (run) => ({
    ...run,
    testCase: { ...run.testCase, seconds: times.get(run.testCase.id) ?? run.testCase.seconds },
  });
  return [
    ...untimed(options),
    ...notices,
    ...runs.flatMap((run) => slowTestFinding(retimed(run), options)),
  ];
}

export function readSlowTestFindings(options) {
  if (options.snapshot === 'base') {
    return [];
  }
  try {
    return findingsOf(options);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return [notice('.', `Slow tests were not checked: reading the test report failed, ${reason}`)];
  }
}
