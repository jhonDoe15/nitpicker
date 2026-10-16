import { TESTS_FAILED_RULE } from '../../../../shared/rules/finding-helpers.mjs';

export const TESTS_TOOL = 'tests';
const UNITTEST_FAILURE = /^(?:FAIL|ERROR): (\S+) \(([\w.]+)\)/gmu;
const LISTED_TESTS = 20;

export function unittestFailures(stderr) {
  return [...stderr.matchAll(UNITTEST_FAILURE)].map(([, method, owner]) => {
    const id = owner.endsWith(`.${method}`) ? owner : `${owner}.${method}`;
    return { id, file: undefined };
  });
}

export function snapshotScope(snapshot = 'head') {
  return `the ${snapshot} snapshot`;
}

export function failingTestModules(failures) {
  return [...new Set(failures.map(({ file }) => file).filter(Boolean))].sort();
}

function listed(failures) {
  const shown = failures.slice(0, LISTED_TESTS).map(({ id }) => `  ${id}`);
  const more = failures.length - LISTED_TESTS;
  return more > 0 ? [...shown, `  and ${String(more)} more`] : shown;
}

function mutationLine(failures, testRunner) {
  const modules = failingTestModules(failures);
  if (testRunner !== 'pytest' || modules.length === 0) {
    return [];
  }
  return [`Mutation testing (mutmut) leaves out the test modules ${modules.join(', ')}.`];
}

export function testFailureFindings({ testFailures = [], testRunner }, snapshot) {
  if (testFailures.length === 0) {
    return [];
  }
  return [
    {
      tool: TESTS_TOOL,
      rule: TESTS_FAILED_RULE,
      path: '.',
      identity: TESTS_FAILED_RULE,
      message: [
        `Tests fail in ${snapshotScope(snapshot)}. Make each failing test pass:`,
        ...listed(testFailures),
        'The static analyzers ran as usual; coverage and CRAP come from the tests that ran.',
        ...mutationLine(testFailures, testRunner),
      ].join('\n'),
      classification: 'tool-error',
    },
  ];
}
