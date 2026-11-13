import {
  TESTS_FAILED_RULE,
  TESTS_FAILED_SCOPE_SEPARATOR,
  testsFailOnBase,
} from '../../../../shared/rules/finding-helpers.mjs';
import {
  testsFailAnchor,
  withTroubleshooting,
} from '../../../../shared/messages/troubleshooting.mjs';
import { failingTestsText } from '../../builds/test-failures.mjs';

const ROOT_MODULE = '.';
export const HEAD_TESTS_TOOL = 'tests';
const MAX_MESSAGE_LENGTH = 4000;
const OWN_ROOT_LISTS = [
  'sourceRoots',
  'kotlinSourceRoots',
  'testSourceRoots',
  'kotlinTestSourceRoots',
];

export function ownSourceRoots(manifest) {
  return OWN_ROOT_LISTS.flatMap((list) => manifest?.[list] ?? []);
}

export function withRootSourceRoots(failures, modules) {
  const roots = ownSourceRoots(modules.find(({ dir }) => dir === '')?.manifest);
  return failures.map((failure) =>
    failure.module === ROOT_MODULE ? { ...failure, roots } : failure,
  );
}

export function isTestFailure(error) {
  return error?.failures?.length > 0;
}

export function runOrNoteFailingTests(run, projectRoot, options) {
  try {
    run(projectRoot, { ...options, testsFailedModules: [] });
    return [];
  } catch (error) {
    if (!isTestFailure(error)) {
      throw error;
    }
    run(projectRoot, {
      ...options,
      testsFailedModules: error.failures.map(({ module }) => module),
    });
    return error.failures;
  }
}

function failureMessage(snapshot, failure) {
  const where = failure.module === ROOT_MODULE ? '' : ` in ${failure.module}`;
  return snapshot === 'base'
    ? testsFailOnBase(failure.tests, where)
    : failingTestsText([failure], 'coverage, CRAP and mutation were skipped', where);
}

export function testsFailedFinding(preset, failure, snapshot) {
  const { module, roots = [] } = failure;
  const message = failureMessage(snapshot, failure);
  return {
    tool: snapshot === 'base' ? preset : HEAD_TESTS_TOOL,
    rule: TESTS_FAILED_RULE,
    path: '.',
    identity: module === ROOT_MODULE ? TESTS_FAILED_RULE : `${TESTS_FAILED_RULE}:${module}`,
    message: withTroubleshooting(
      message.length > MAX_MESSAGE_LENGTH ? `${message.slice(0, MAX_MESSAGE_LENGTH)}...` : message,
      testsFailAnchor(snapshot),
    ),
    classification: 'tool-error',
    symbol:
      module === ROOT_MODULE && roots.length > 0
        ? roots.join(TESTS_FAILED_SCOPE_SEPARATOR)
        : module,
  };
}

export function withTestsFailures(findings, failures = [], { preset, snapshot }) {
  return [...findings, ...failures.map((failure) => testsFailedFinding(preset, failure, snapshot))];
}
