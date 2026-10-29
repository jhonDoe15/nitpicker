import {
  TESTS_FAILED_RULE,
  TESTS_NOT_RUN_RULE,
  testsFailOnBase,
} from '../../../../shared/rules/finding-helpers.mjs';

const TESTS_TOOL = 'tests';
const UNITTEST_FAILURE = /^(?:FAIL|ERROR): (\S+) \(([\w.]+)\)/gmu;
const LISTED_TESTS = 20;
const LOAD_FAILURE_OWNER = '_FailedTest';

export function unittestFailures(stderr) {
  return [...stderr.matchAll(UNITTEST_FAILURE)].map(([, method, owner]) => {
    const id = owner.endsWith(`.${method}`) ? owner : `${owner}.${method}`;
    return { id, file: undefined, notRun: owner.includes(LOAD_FAILURE_OWNER) };
  });
}

export function snapshotScope(snapshot = 'head') {
  return `the ${snapshot} snapshot`;
}

function modulesOfFailures(failures) {
  return [...new Set(failures.map(({ file }) => file).filter(Boolean))].sort();
}

function listed(failures) {
  const shown = failures.slice(0, LISTED_TESTS).map(({ id }) => `  ${id}`);
  const more = failures.length - LISTED_TESTS;
  return more > 0 ? [...shown, `  and ${String(more)} more`] : shown;
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
    `Tests fail in ${snapshotScope('head')}. Make each failing test pass:`,
    ...listed(testFailures),
    'The static analyzers ran as usual; coverage and CRAP come from the tests that ran.',
    ...mutationLine(testFailures, testRunner),
  ].join('\n');
}

function notRunMessage(testFailures, snapshot) {
  return [
    `Tests could not run in ${snapshotScope(snapshot)}. Fix what stops them from loading:`,
    ...listed(testFailures),
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
