import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { RULE_IDS, TEST_TIME_DEFAULTS } from '../../../../shared/policy.mjs';
import { readJunit } from './junit-results.mjs';

export const SLOW_TEST_TOOL = 'test-runtime';
const INTEGRATION_FOLDERS = new Set(['integration', 'integration_tests', 'e2e', 'end_to_end']);
const INTEGRATION_MARK = /\bmark\s*\.\s*(?:integration|e2e)\b/u;
const DEFINITION = /^(\s*)(?:async\s+)?def\s+(\w+)\s*\(/u;
const CLASS = /^(\s*)class\s+\w+/u;
const DECORATOR = /^\s*@/u;
const MODULE_MARKS = /^pytestmark\s*=[^\n]*(?:\n[ \t)\]][^\n]*)*/mu;

function readLines(root, file) {
  const absolute = root === undefined || file === '' ? undefined : path.join(root, file);
  return absolute !== undefined && existsSync(absolute)
    ? readFileSync(absolute, 'utf8').split(/\r?\n/u)
    : undefined;
}

function indentOf(line) {
  return /^\s*/u.exec(line)[0].length;
}

function blockAt(lines, definition) {
  const indent = indentOf(lines[definition]);
  let first = definition;
  while (first > 0 && DECORATOR.test(lines[first - 1])) first -= 1;
  let last = definition;
  for (let index = definition + 1; index < lines.length; index += 1) {
    if (lines[index].trim() === '') continue;
    if (indentOf(lines[index]) <= indent) break;
    last = index;
  }
  return { first, definition, last, text: lines.slice(first, last + 1).join('\n') };
}

function blocksNamed(lines, name) {
  return lines.flatMap((line, index) =>
    DEFINITION.exec(line)?.[2] === name ? [blockAt(lines, index)] : [],
  );
}

function classDecorators(lines, block) {
  const indent = indentOf(lines[block.definition]);
  for (let index = block.first - 1; index >= 0; index -= 1) {
    const owner = CLASS.exec(lines[index]);
    if (owner !== null && owner[1].length < indent) {
      return blockAt(lines, index)
        .text.split('\n')
        .filter((line) => DECORATOR.test(line));
    }
  }
  return [];
}

function isIntegration(testCase, lines, block) {
  const folders = path.posix.dirname(testCase.file).split('/');
  if (folders.some((folder) => INTEGRATION_FOLDERS.has(folder))) return true;
  if (block === undefined) return false;
  const marks = [
    ...lines.slice(block.first, block.definition),
    ...classDecorators(lines, block),
    MODULE_MARKS.exec(lines.join('\n'))?.[0] ?? '',
  ];
  return marks.some((line) => INTEGRATION_MARK.test(line));
}

function headBlock(lines, testCase) {
  if (lines === undefined || testCase.functionName === undefined) return undefined;
  const blocks = blocksNamed(lines, testCase.functionName);
  return (
    blocks.find(
      ({ first, definition }) => testCase.line - 1 >= first && testCase.line - 1 <= definition,
    ) ?? blocks[0]
  );
}

function isChanged(testCase, block, baselineRoot) {
  const base = readLines(baselineRoot, testCase.file);
  return base === undefined || block === undefined
    ? true
    : !blocksNamed(base, testCase.functionName).some(({ text }) => text === block.text);
}

function slowestRuns(cases) {
  const byTest = new Map();
  for (const testCase of cases) {
    const key = `${testCase.file}::${testCase.className}::${testCase.functionName}`;
    if ((byTest.get(key)?.seconds ?? -1) < testCase.seconds) byTest.set(key, testCase);
  }
  return [...byTest.values()];
}

function slowTestMessage({ testCase, limit, integration }) {
  const name = [testCase.className, testCase.functionName].filter(Boolean).join('.');
  const move = integration
    ? ''
    : ', or move it to a tests/integration/ folder or mark it @pytest.mark.integration if it is one';
  return `${name} took ${testCase.seconds.toFixed(1)} s; ${integration ? 'an integration' : 'a unit'} test may take ${String(limit)} s. Remove time.sleep and other real waits, and use smaller fixtures${move}.`;
}

export function readSlowTestFindings({ reportRoot, projectRoot, limits, baselineRoot, snapshot }) {
  if (snapshot === 'base') return [];
  const budget = { ...TEST_TIME_DEFAULTS, ...limits };
  return slowestRuns(readJunit(reportRoot).filter(({ name }) => name !== undefined)).flatMap(
    (testCase) => {
      const lines = readLines(projectRoot, testCase.file);
      const block = headBlock(lines, testCase);
      const integration = isIntegration(testCase, lines, block);
      const limit = integration ? budget.integrationTestSeconds : budget.unitTestSeconds;
      const counted = baselineRoot === undefined || isChanged(testCase, block, baselineRoot);
      if (testCase.seconds <= limit || !counted) return [];
      return [
        {
          tool: SLOW_TEST_TOOL,
          rule: RULE_IDS.slowTest,
          path: testCase.file,
          identity: `test:${testCase.file}::${testCase.className}::${testCase.functionName}`,
          ...(block === undefined ? {} : { location: { line: block.definition + 1 } }),
          message: slowTestMessage({ testCase, limit, integration }),
          classification: 'enforceable',
        },
      ];
    },
  );
}
