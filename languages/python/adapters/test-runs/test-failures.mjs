import {
  TESTS_FAILED_RULE,
  TESTS_NOT_RUN_RULE,
  testsFailHeadline,
  testsFailOnBase,
} from '../../../../shared/rules/finding-helpers.mjs';
import {
  failingTestEntries,
  valuesInMessage,
} from '../../../../shared/rules/failing-tests/failing-tests.mjs';
import path from 'node:path';

const TESTS_TOOL = 'tests';
const UNITTEST_FAILURE = /^(?:FAIL|ERROR): (\S+) \(([\w.]+)\)/gmu;
const LOAD_FAILURE_OWNER = '_FailedTest';

const BLOCK_END = /^(?:={20,}|-{20,})$/mu;
const TRACEBACK_FILE = /^\s*File "(?<file>[^"]+)", line (?<line>\d+)/gmu;

function projectPath(file, projectRoot) {
  const relative = path.relative(projectRoot ?? '', file).replaceAll('\\', '/');
  return projectRoot === undefined || relative.startsWith('..') || path.isAbsolute(relative)
    ? path.basename(file)
    : relative;
}

const FRAME_LINE = /^\s*File "/u;
const INDENTED = /^\s/u;

function exceptionLine(block) {
  const lines = block.split('\n');
  const lastFrame = lines.findLastIndex((line) => FRAME_LINE.test(line));
  return lastFrame === -1
    ? undefined
    : lines.slice(lastFrame + 1).find((line) => line.trim() !== '' && !INDENTED.test(line));
}

function inTestModule(file, owner, projectRoot) {
  const module = projectPath(file, projectRoot).replace(/\.py$/u, '').replaceAll('/', '.');
  return `${owner}.`.startsWith(`${module}.`);
}

function tracebackFailure(block, { owner, projectRoot }) {
  const frames = [...block.matchAll(TRACEBACK_FILE)].map(({ groups }) => groups);
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

export function unittestFailures(stderr, projectRoot) {
  return [...stderr.matchAll(UNITTEST_FAILURE)].map((match) => {
    const [header, method, owner] = match;
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

export function snapshotScope(snapshot = 'head') {
  return `the ${snapshot} snapshot`;
}

function modulesOfFailures(failures) {
  return [...new Set(failures.map(({ file }) => file).filter(Boolean))].sort();
}

function entryOf({ id, file, failure = {} }) {
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

function listed(failures) {
  return failingTestEntries(failures.map(entryOf));
}

function listedIds(failures) {
  return failingTestEntries(failures.map(({ id }) => ({ name: id })));
}

function mutationLine(failures, testRunner) {
  const modules = modulesOfFailures(failures);
  if (testRunner !== 'pytest' || modules.length === 0) {
    return [];
  }
  return [`Mutation testing (mutmut) leaves out the test modules ${modules.join(', ')}.`];
}

function headMessage(testFailures, testRunner) {
  return [
    testsFailHeadline(
      testFailures.length,
      'the static analyzers ran, and coverage and CRAP come from the tests that ran',
    ),
    ...listed(testFailures),
    ...mutationLine(testFailures, testRunner),
  ].join('\n');
}

function notRunMessage(testFailures, snapshot) {
  return [
    `Tests could not run in ${snapshotScope(snapshot)}. Fix what stops them from loading:`,
    ...listedIds(testFailures),
  ].join('\n');
}

function messageOf({ testFailures, testRunner }, snapshot, notRun) {
  if (notRun) {
    return notRunMessage(testFailures, snapshot);
  }
  return snapshot === 'base'
    ? testsFailOnBase(testFailures.map(({ id }) => id))
    : headMessage(testFailures, testRunner);
}

export function testFailureFindings(manifest, snapshot = 'head') {
  const { testFailures = [] } = manifest;
  if (testFailures.length === 0) {
    return [];
  }
  const notRun = testFailures.every((failed) => failed.notRun === true);
  const rule = notRun ? TESTS_NOT_RUN_RULE : TESTS_FAILED_RULE;
  const message = messageOf({ ...manifest, testFailures }, snapshot, notRun);
  return [
    { tool: TESTS_TOOL, rule, path: '.', identity: rule, message, classification: 'tool-error' },
  ];
}
