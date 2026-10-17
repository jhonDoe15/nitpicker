import path from 'node:path';
import { RULE_IDS, TEST_TIME_DEFAULTS } from '../../../../shared/policy.mjs';
import { readProjectFile } from '../../libraries/project-files.mjs';
import { listOtherModules } from '../analysis/python-sources.mjs';
import { readJunit } from './junit-results.mjs';
import { functionBlocks } from './python-blocks.mjs';

const SLOW_TEST_TOOL = 'test-runtime';
const INTEGRATION_FOLDERS = new Set(['integration', 'integration_tests', 'e2e', 'end_to_end']);
const INTEGRATION_MARK = /\bmark\s*\.\s*(?:integration|e2e)\b/u;
const MOVE_ADVICE = {
  pytest:
    ', or move it to a tests/integration/ folder or mark it @pytest.mark.integration if it is one',
  unittest: ', or move it to a tests/integration/ folder if it is one',
};

function readText(root, file) {
  return root === undefined || file === '' ? undefined : readProjectFile(root, file);
}

function isIntegration(testCase, block) {
  const folders = path.posix.dirname(testCase.file).split('/');
  return (
    folders.some((folder) => INTEGRATION_FOLDERS.has(folder)) ||
    (block?.marks ?? []).some((mark) => INTEGRATION_MARK.test(mark))
  );
}

function headBlock(text, testCase) {
  if (text === undefined || testCase.functionName === undefined) {
    return undefined;
  }
  const blocks = functionBlocks(text, testCase.functionName);
  const index = (testCase.line ?? 0) - 1;
  return blocks.find(({ first, definition }) => index >= first && index <= definition) ?? blocks[0];
}

function hasBlock(text, testCase, block) {
  return (
    text !== undefined &&
    functionBlocks(text, testCase.functionName).some(({ text: base }) => base === block.text)
  );
}

function baseTestFiles(baselineRoot) {
  return listOtherModules(baselineRoot, [], [])
    .filter(({ kind }) => kind === 'test')
    .map(({ file }) => file);
}

function changeReader(baselineRoot) {
  let others;
  return (testCase, block) => {
    if (block === undefined) {
      return true;
    }
    if (hasBlock(readText(baselineRoot, testCase.file), testCase, block)) {
      return false;
    }
    others ??= baseTestFiles(baselineRoot);
    return !others.some(
      (file) => file !== testCase.file && hasBlock(readText(baselineRoot, file), testCase, block),
    );
  };
}

function slowestRuns(cases) {
  const byTest = new Map();
  for (const testCase of cases) {
    const key = `${testCase.file}::${testCase.className}::${testCase.functionName}`;
    if ((byTest.get(key)?.seconds ?? -1) < testCase.seconds) {
      byTest.set(key, testCase);
    }
  }
  return [...byTest.values()];
}

function slowTestMessage({ testCase, limit, integration, testRunner }) {
  const name = [testCase.className, testCase.functionName].filter(Boolean).join('.');
  const move = integration ? '' : (MOVE_ADVICE[testRunner] ?? MOVE_ADVICE.pytest);
  return `${name} took ${testCase.seconds.toFixed(1)} s; ${integration ? 'an integration' : 'a unit'} test may take ${String(limit)} s. Remove time.sleep and other real waits, and use smaller fixtures${move}.`;
}

export function readSlowTestFindings(options) {
  const { reportRoot, projectRoot, limits, baselineRoot, snapshot, testRunner } = options;
  if (snapshot === 'base') {
    return [];
  }
  const budget = { ...TEST_TIME_DEFAULTS, ...limits };
  const isChanged = baselineRoot === undefined ? () => true : changeReader(baselineRoot);
  return slowestRuns(readJunit(reportRoot).filter(({ name }) => name !== undefined)).flatMap(
    (testCase) => {
      const block = headBlock(readText(projectRoot, testCase.file), testCase);
      const integration = isIntegration(testCase, block);
      const limit = integration ? budget.integrationTestSeconds : budget.unitTestSeconds;
      if (testCase.seconds <= limit || !isChanged(testCase, block)) {
        return [];
      }
      return [
        {
          tool: SLOW_TEST_TOOL,
          rule: RULE_IDS.slowTest,
          path: testCase.file,
          identity: `test:${testCase.file}::${testCase.className}::${testCase.functionName}`,
          ...(block === undefined ? {} : { location: { line: block.definition + 1 } }),
          message: slowTestMessage({ testCase, limit, integration, testRunner }),
          classification: 'enforceable',
        },
      ];
    },
  );
}
