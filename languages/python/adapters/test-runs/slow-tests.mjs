import { existsSync } from 'node:fs';
import path from 'node:path';
import { RULE_IDS, TEST_TIME_DEFAULTS } from '../../../../shared/policy.mjs';
import { insideProject, readProjectFile } from '../../libraries/project-files.mjs';
import { listOtherModules } from '../analysis/python-sources.mjs';
import { readJunit } from './junit-results.mjs';
import { classHeader, functionBlocks, mentions, withoutParamCalls } from './python-blocks.mjs';

const SLOW_TEST_TOOL = 'test-runtime';
const INTEGRATION_FOLDERS = new Set(['integration', 'integration_tests', 'e2e', 'end_to_end']);
const INTEGRATION_MARKS = new Set(['integration', 'e2e']);
const INTEGRATION_MARK = /\bmark\s*\.\s*(?:integration|e2e)\b/u;
const MOVE_ADVICE = {
  pytest:
    ', or move it to a tests/integration/ folder or mark it @pytest.mark.integration if it is one',
  unittest: ', or move it to a tests/integration/ folder if it is one',
};

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

function slowTestMessage({ testCase, collected, limit, integration, testRunner }) {
  const name = [collected.className, testCase.functionName].filter(Boolean).join('.');
  const move = integration ? '' : (MOVE_ADVICE[testRunner] ?? MOVE_ADVICE.pytest);
  return `${name} took ${testCase.seconds.toFixed(1)} s; ${integration ? 'an integration' : 'a unit'} test may take ${String(limit)} s. Remove time.sleep and other real waits, and use smaller fixtures${move}.`;
}

function slowTestFinding(run, testRunner) {
  const { testCase, block } = run;
  return {
    tool: SLOW_TEST_TOOL,
    rule: RULE_IDS.slowTest,
    path: testCase.file,
    identity: `test:${keyOf(run)}`,
    ...(block === undefined ? {} : { location: { line: block.definition + 1 } }),
    message: slowTestMessage({ ...run, testRunner }),
    classification: 'enforceable',
  };
}

export function readSlowTestFindings(options) {
  const { reportRoot, projectRoot, limits, baselineRoot, snapshot, testRunner } = options;
  if (snapshot === 'base') {
    return [];
  }
  const budget = { ...TEST_TIME_DEFAULTS, ...limits };
  const floor = Math.min(budget.unitTestSeconds, budget.integrationTestSeconds);
  const isChanged =
    baselineRoot === undefined ? () => true : changeReader({ baselineRoot, projectRoot });
  const runs = readJunit(reportRoot)
    .filter(({ name, seconds }) => name !== undefined && seconds > floor)
    .map(measured(projectRoot, budget))
    .filter(({ testCase, limit }) => testCase.seconds > limit);
  return slowestRuns(runs)
    .filter((run) => isChanged(run))
    .map((run) => slowTestFinding(run, testRunner));
}
