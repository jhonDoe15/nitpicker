import {
  TESTS_FAILED_RULE,
  TESTS_NOT_RUN_RULE,
  testsFailHeadline as untypedHeadline,
  testsFailOnBase as untypedOnBase,
} from '../../../../shared/rules/finding-helpers.mjs';
import {
  failingTestEntries as untypedEntries,
  valuesInMessage as untypedValues,
} from '../../../../shared/rules/failing-tests/failing-tests.mjs';
import path from 'node:path';
import type { IngestedFinding } from '../../ingest/typed/ingest-types.mts';
import type { FailureManifest, TestFailure, TracebackFailure } from './typed/run-types.mts';

type EntryDetails = {
  readonly expected?: string | undefined;
  readonly received?: string | undefined;
};

const testsFailHeadline: (count: number, consequence: string) => string = untypedHeadline;
const testsFailOnBase: (tests: string[]) => string = untypedOnBase;
const failingTestEntries: (failures: readonly object[]) => string[] = untypedEntries;
const valuesInMessage: (text: string | undefined) => EntryDetails = untypedValues;

const TESTS_TOOL = 'tests';
const UNITTEST_FAILURE = /^(?:FAIL|ERROR): (\S+) \(([\w.]+)\)/gmu;
const LOAD_FAILURE_OWNER = '_FailedTest';

const BLOCK_END = /^(?:={20,}|-{20,})$/mu;
const TRACEBACK_FILE = /^\s*File "(?<file>[^"]+)", line (?<line>\d+)/gmu;

function projectPath(file: string, projectRoot: string | undefined): string {
  const relative = path.relative(projectRoot ?? '', file).replaceAll('\\', '/');
  return projectRoot === undefined || relative.startsWith('..') || path.isAbsolute(relative)
    ? path.basename(file)
    : relative;
}

const FRAME_LINE = /^\s*File "/u;
const INDENTED = /^\s/u;

function exceptionLine(block: string): string | undefined {
  const lines = block.split('\n');
  const lastFrame = lines.findLastIndex((line) => FRAME_LINE.test(line));
  return lastFrame === -1
    ? undefined
    : lines.slice(lastFrame + 1).find((line) => line.trim() !== '' && !INDENTED.test(line));
}

function inTestModule(file: string, owner: string, projectRoot: string | undefined): boolean {
  const module = projectPath(file, projectRoot).replace(/\.py$/u, '').replaceAll('/', '.');
  return `${owner}.`.startsWith(`${module}.`);
}

function tracebackFailure(
  block: string,
  { owner, projectRoot }: { readonly owner: string; readonly projectRoot: string | undefined },
): TracebackFailure {
  const frames = [...block.matchAll(TRACEBACK_FILE)].flatMap(({ groups }) =>
    groups === undefined ? [] : [{ file: groups['file'] ?? '', line: groups['line'] ?? '' }],
  );
  const message = exceptionLine(block)?.trim();
  const frame =
    frames.findLast(({ file }) => inTestModule(file, owner, projectRoot)) ??
    frames.findLast(({ file }) => !file.includes(`${path.sep}unittest${path.sep}`));
  return {
    ...(frame === undefined
      ? {}
      : { path: projectPath(frame.file, projectRoot), line: Number(frame.line) }),
    ...(message === undefined ? {} : { message }),
  };
}

export function unittestFailures(stderr: string, projectRoot?: string): TestFailure[] {
  return [...stderr.matchAll(UNITTEST_FAILURE)].map((match) => {
    const [header = '', method = '', owner = ''] = match;
    const id = owner.endsWith(`.${method}`) ? owner : `${owner}.${method}`;
    const rest = stderr.slice(match.index + header.length).replace(/^[^\n]*\n-{20,}\n/u, '');
    const end = rest.search(BLOCK_END);
    const block = end === -1 ? rest : rest.slice(0, end);
    const failure = tracebackFailure(block, { owner, projectRoot });
    return {
      id,
      file: undefined,
      notRun: owner.includes(LOAD_FAILURE_OWNER),
      ...(Object.keys(failure).length === 0 ? {} : { failure }),
    };
  });
}

export function snapshotScope(snapshot = 'head'): string {
  return `the ${snapshot} snapshot`;
}

function modulesOfFailures(failures: readonly TestFailure[]): string[] {
  return [
    ...new Set(
      failures
        .map(({ file }) => file)
        .filter((file): file is string => file !== undefined && file !== ''),
    ),
  ].sort();
}

function entryOf({ id, file, failure = {} }: TestFailure): object {
  const where = failure.path ?? file;
  const name = where !== undefined && id.startsWith(`${where}::`) ? id.slice(where.length + 2) : id;
  return {
    file: where,
    name,
    ...(failure.line === undefined ? {} : { line: failure.line }),
    ...(failure.message === undefined ? {} : { message: failure.message }),
    ...valuesInMessage(failure.message),
  };
}

function listed(failures: readonly TestFailure[]): string[] {
  return failingTestEntries(failures.map(entryOf));
}

function listedIds(failures: readonly TestFailure[]): string[] {
  return failingTestEntries(failures.map(({ id }) => ({ name: id })));
}

function mutationLine(failures: readonly TestFailure[], testRunner: string | undefined): string[] {
  const modules = modulesOfFailures(failures);
  if (testRunner !== 'pytest' || modules.length === 0) {
    return [];
  }
  return [`Mutation testing (mutmut) leaves out the test modules ${modules.join(', ')}.`];
}

function headMessage(testFailures: readonly TestFailure[], testRunner: string | undefined): string {
  return [
    testsFailHeadline(
      testFailures.length,
      'the static analyzers ran, and coverage and CRAP come from the tests that ran',
    ),
    ...listed(testFailures),
    ...mutationLine(testFailures, testRunner),
  ].join('\n');
}

function notRunMessage(testFailures: readonly TestFailure[], snapshot: string): string {
  return [
    `Tests could not run in ${snapshotScope(snapshot)}. Fix what stops them from loading:`,
    ...listedIds(testFailures),
  ].join('\n');
}

function messageOf(
  { testFailures, testRunner }: FailureManifest & { readonly testFailures: readonly TestFailure[] },
  snapshot: string,
  notRun: boolean,
): string {
  if (notRun) {
    return notRunMessage(testFailures, snapshot);
  }
  return snapshot === 'base'
    ? testsFailOnBase(testFailures.map(({ id }) => id))
    : headMessage(testFailures, testRunner);
}

export function testFailureFindings(
  manifest: FailureManifest,
  snapshot = 'head',
): IngestedFinding[] {
  const { testFailures = [] } = manifest;
  if (testFailures.length === 0) {
    return [];
  }
  const notRun = testFailures.every((failed) => failed.notRun);
  const rule = notRun ? TESTS_NOT_RUN_RULE : TESTS_FAILED_RULE;
  const message = messageOf({ ...manifest, testFailures }, snapshot, notRun);
  return [
    { tool: TESTS_TOOL, rule, path: '.', identity: rule, message, classification: 'tool-error' },
  ];
}
