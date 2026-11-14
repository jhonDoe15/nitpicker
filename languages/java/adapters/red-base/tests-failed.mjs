import {
  TESTS_FAILED_RULE,
  TESTS_TIMED_OUT_RULE,
  TESTS_FAILED_SCOPE_SEPARATOR,
  testsFailOnBase,
} from '../../../../shared/rules/finding-helpers.mjs';
import {
  TROUBLESHOOTING_ANCHORS,
  withTroubleshooting,
} from '../../../../shared/messages/troubleshooting.mjs';
import { failingTestsText } from '../../builds/test-failures.mjs';

const ROOT_MODULE = '.';
export const HEAD_TESTS_TOOL = 'tests';
const HEAD_CONSEQUENCE = 'coverage, CRAP and mutation were skipped, the other checks ran';
const MODULE_CONSEQUENCE = 'coverage, CRAP and mutation were skipped there, the other checks ran';
const MAX_MESSAGE_LENGTH = 4000;
const MAX_HEAD_MESSAGE_LENGTH = 40_000;
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
    failure.module === ROOT_MODULE && failure.timedOut === undefined
      ? { ...failure, roots }
      : failure,
  );
}

export function isTestFailure(error) {
  return error?.failures?.length > 0;
}

export function isTestsTimeout(error, policy) {
  return error?.timedOut !== undefined && policy?.quick !== true;
}

export function timedOutTests(timedOut) {
  return { module: ROOT_MODULE, tests: [], timedOut };
}

export function runOrNoteFailingTests(run, projectRoot, options) {
  try {
    run(projectRoot, { ...options, testsFailedModules: [] });
    return [];
  } catch (error) {
    if (isTestsTimeout(error, options.policy)) {
      run(projectRoot, { ...options, testsFailedModules: [], testsSkipped: true });
      return [timedOutTests(error.timedOut)];
    }
    if (!isTestFailure(error)) {
      throw error;
    }
    return rerunWithoutFailingTests(run, projectRoot, { options, failures: error.failures });
  }
}

function modulesOf(failures) {
  return [...new Set(failures.map(({ module }) => module))];
}

function rerunWithoutFailingTests(run, projectRoot, { options, failures }) {
  try {
    run(projectRoot, { ...options, testsFailedModules: modulesOf(failures) });
    return failures;
  } catch (error) {
    if (!isTestFailure(error)) {
      throw error;
    }
    const all = [...failures, ...error.failures];
    run(projectRoot, { ...options, testsFailedModules: modulesOf(all) });
    return all;
  }
}

function timeoutMessage({ build, minutes }, snapshot) {
  const where = snapshot === 'base' ? ' on the base' : '';
  return (
    `${build} did not finish the tests, coverage and mutation testing${where} within ` +
    `${String(minutes)} minutes, so they were skipped and the other checks ran without them. ` +
    `Set NITPICKER_${build.toUpperCase()}_TIMEOUT_MINUTES to give each ${build} command more time`
  );
}

function cutMessage(message, limit = MAX_MESSAGE_LENGTH) {
  return message.length > limit ? `${message.slice(0, limit)}...` : message;
}

function failureMessage(failure, snapshot) {
  if (failure.timedOut !== undefined) {
    return timeoutMessage(failure.timedOut, snapshot);
  }
  if (snapshot !== 'base') {
    const consequence = failure.module === ROOT_MODULE ? HEAD_CONSEQUENCE : MODULE_CONSEQUENCE;
    return cutMessage(failingTestsText([failure], consequence), MAX_HEAD_MESSAGE_LENGTH);
  }
  const { module, tests } = failure;
  return withTroubleshooting(
    cutMessage(testsFailOnBase(tests, module === ROOT_MODULE ? '' : ` in ${module}`)),
    TROUBLESHOOTING_ANCHORS.baseTestsFail,
  );
}

export function testsFailedFinding(preset, failure, snapshot = 'base') {
  const { module, roots = [] } = failure;
  const rule = failure.timedOut === undefined ? TESTS_FAILED_RULE : TESTS_TIMED_OUT_RULE;
  return {
    tool: snapshot === 'base' ? preset : HEAD_TESTS_TOOL,
    rule,
    path: '.',
    identity: module === ROOT_MODULE ? rule : `${rule}:${module}`,
    message: failureMessage(failure, snapshot),
    classification: 'tool-error',
    symbol:
      module === ROOT_MODULE && roots.length > 0
        ? roots.join(TESTS_FAILED_SCOPE_SEPARATOR)
        : module,
  };
}

export function withTestsFailures(findings, { preset, failures = [], snapshot = 'base' }) {
  return [...findings, ...failures.map((failure) => testsFailedFinding(preset, failure, snapshot))];
}
