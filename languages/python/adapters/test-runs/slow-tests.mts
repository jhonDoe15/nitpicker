import { existsSync } from 'node:fs';
import path from 'node:path';
import {
  slowTestBudget as untypedBudget,
  slowTestFindings as untypedFindings,
} from '../../../../shared/rules/slow-tests/slow-test-finding.mjs';
import { insideProject, readProjectFile } from '../../libraries/project-files.mts';
import { listOtherModules } from '../analysis/python-sources.mts';
import { JUNIT_REPORT, RERUN_REPORT, readJunit } from './junit-results.mts';
import { classHeader, functionBlocks, mentions, withoutParamCalls } from './python-blocks.mts';
import { messageOf } from '../../../../shared/values/readers.mts';
import type { IngestedFinding } from '../../ingest/typed/ingest-types.mts';
import type {
  Budget,
  Collected,
  FunctionBlock,
  JunitTestCase,
  Measured,
  SlowOptions,
} from './typed/run-types.mts';

type Attempt<Value> =
  | { readonly value: Value; readonly notice?: undefined }
  | { readonly notice: IngestedFinding; readonly value?: undefined };

const slowTestBudget: (limits: unknown) => Budget = untypedBudget;
const slowTestFindings: (request: {
  tool: string;
  language: string;
  advice: string;
  test: { path: string; name: string; identity: string; seconds: number; line?: number };
  integration: boolean;
  limits: unknown;
}) => IngestedFinding[] = untypedFindings;

const SLOW_TEST_TOOL = 'test-runtime';
const INTEGRATION_FOLDERS = new Set(['integration', 'integration_tests', 'e2e', 'end_to_end']);
const INTEGRATION_MARKS = new Set(['integration', 'e2e']);
const INTEGRATION_MARK = /\bmark\s*\.\s*(?:integration|e2e)\b/u;
const NOT_TIMED =
  'The test run wrote no timing report, so slow tests were not checked ' +
  '(a project that disables the JUnit report is not timed)';

function readText(root: string | undefined, file: string): string | undefined {
  return root === undefined || file === '' ? undefined : readProjectFile(root, file);
}

function exists(root: string, file: string): boolean {
  return existsSync(insideProject(root, file));
}

function collectedFrom(projectRoot: string, testCase: JunitTestCase): Collected {
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

function isIntegration(testCase: JunitTestCase, block: FunctionBlock | undefined): boolean {
  const folders = path.posix.dirname(testCase.file).split('/');
  const marked =
    testCase.marks === undefined
      ? (block?.marks ?? []).some((mark) => INTEGRATION_MARK.test(withoutParamCalls(mark)))
      : testCase.marks.some((mark) => INTEGRATION_MARKS.has(mark));
  return marked || folders.some((folder) => INTEGRATION_FOLDERS.has(folder));
}

function headBlock(
  text: string | undefined,
  testCase: JunitTestCase,
  owner: string,
): FunctionBlock | undefined {
  const blocks = text === undefined ? [] : functionBlocks(text);
  const index = (testCase.line ?? 0) - 1;
  const atLine = blocks.filter(({ first, definition }) => index >= first && index <= definition);
  return (
    atLine.find(({ name }) => name === testCase.functionName) ??
    atLine[0] ??
    blocks.find(({ name, owner: scope }) => name === testCase.functionName && scope === owner)
  );
}

function hasBlock(text: string | undefined, block: FunctionBlock): boolean {
  return (
    text !== undefined &&
    functionBlocks(text, block.name).some(
      ({ owner, text: base }) => owner === block.owner && base === block.text,
    )
  );
}

function baseTestFiles(baselineRoot: string): string[] {
  return listOtherModules(baselineRoot, [], [])
    .filter(({ kind }) => kind === 'test')
    .map(({ file }) => file);
}

function sameList(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((entry, index) => entry === right[index]);
}

function changeReader({
  baselineRoot,
  projectRoot,
}: {
  readonly baselineRoot: string;
  readonly projectRoot: string;
}): (run: Measured) => boolean {
  let movedAway: string[] | undefined;
  function baseHas(file: string, matches: (text: string | undefined) => boolean): boolean {
    if (matches(readText(baselineRoot, file))) {
      return true;
    }
    movedAway ??= baseTestFiles(baselineRoot).filter((other) => !exists(projectRoot, other));
    return movedAway.some((other) => other !== file && matches(readText(baselineRoot, other)));
  }
  function classKept({ file, className }: Collected): boolean {
    const header = classHeader(readText(projectRoot, file) ?? '', className);
    return baseHas(file, (text) => text !== undefined && classHeader(text, className) === header);
  }
  function namesKept({ file }: Collected, name: string): boolean {
    const head = mentions(readText(projectRoot, file) ?? '', name);
    return baseHas(file, (text) => text !== undefined && sameList(mentions(text, name), head));
  }
  return ({ testCase, block, collected }) => {
    const named = block?.name === testCase.functionName;
    const inherited = block !== undefined && named && block.owner !== collected.className;
    return (
      (block !== undefined && !baseHas(testCase.file, (text) => hasBlock(text, block))) ||
      ((inherited || !named) && collected.className !== '' && !classKept(collected)) ||
      !(named || namesKept(collected, testCase.functionName ?? ''))
    );
  };
}

function measured(projectRoot: string, budget: Budget): (testCase: JunitTestCase) => Measured {
  return (testCase) => {
    const collected = collectedFrom(projectRoot, testCase);
    const block = headBlock(readText(projectRoot, testCase.file), testCase, collected.className);
    const integration = isIntegration(testCase, block);
    const limit = integration ? budget.integrationTestSeconds : budget.unitTestSeconds;
    return { testCase, collected, block, integration, limit };
  };
}

function keyOf({ testCase, collected }: Measured): string {
  return `${collected.file}::${collected.className}::${testCase.functionName ?? ''}`;
}

function slowestRuns(runs: readonly Measured[]): Measured[] {
  const byTest = new Map<string, Measured>();
  for (const run of runs) {
    if ((byTest.get(keyOf(run))?.testCase.seconds ?? -1) < run.testCase.seconds) {
      byTest.set(keyOf(run), run);
    }
  }
  return [...byTest.values()];
}

function notice(file: string, message: string): IngestedFinding {
  return {
    tool: SLOW_TEST_TOOL,
    rule: 'slow-test-not-timed',
    path: file,
    identity: `slow-test-not-timed:${file}`,
    message,
    classification: 'descriptive',
  };
}

function unreadable(file: string, error: unknown): IngestedFinding {
  const reason = messageOf(error);
  return notice(file, `${file} is not checked for slow tests: reading its tests failed, ${reason}`);
}

function safely<Value>(testCase: { readonly file: string }, step: () => Value): Attempt<Value> {
  try {
    return { value: step() };
  } catch (error) {
    return { notice: unreadable(testCase.file, error) };
  }
}

export function slowCandidates(options: SlowOptions): {
  runs: Measured[];
  notices: IngestedFinding[];
} {
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
    tried.flatMap(({ value }) =>
      value !== undefined && value.testCase.seconds > value.limit ? [value] : [],
    ),
  );
  const checked = over.map((run) => ({ run, ...safely(run.testCase, () => isChanged(run)) }));
  return {
    runs: checked.filter(({ value }) => value === true).map(({ run }) => run),
    notices: [...tried, ...checked].flatMap((entry) =>
      entry.notice === undefined ? [] : [entry.notice],
    ),
  };
}

function retimes(reportRoot: string): Map<string, number> {
  return new Map(
    readJunit(reportRoot, RERUN_REPORT)
      .filter(({ outcome }) => outcome === 'passed')
      .map(({ id, seconds }): [string, number] => [id, seconds]),
  );
}

function slowTestFinding(run: Measured, options: SlowOptions): IngestedFinding[] {
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

function untimed({ reportRoot, testsRan }: SlowOptions): IngestedFinding[] {
  const missing = !existsSync(path.join(reportRoot, JUNIT_REPORT));
  return missing && testsRan === true ? [notice('.', NOT_TIMED)] : [];
}

function findingsOf(options: SlowOptions): IngestedFinding[] {
  const { runs, notices } = slowCandidates(options);
  const times = retimes(options.reportRoot);
  function retimed(run: Measured): Measured {
    return {
      ...run,
      testCase: { ...run.testCase, seconds: times.get(run.testCase.id) ?? run.testCase.seconds },
    };
  }
  return [
    ...untimed(options),
    ...notices,
    ...runs.flatMap((run) => slowTestFinding(retimed(run), options)),
  ];
}

export function readSlowTestFindings(options: SlowOptions): IngestedFinding[] {
  if (options.snapshot === 'base') {
    return [];
  }
  try {
    return findingsOf(options);
  } catch (error) {
    const reason = messageOf(error);
    return [notice('.', `Slow tests were not checked: reading the test report failed, ${reason}`)];
  }
}
