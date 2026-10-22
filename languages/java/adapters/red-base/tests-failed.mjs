import { TESTS_FAILED_RULE, testsFailOnBase } from '../../../../shared/rules/finding-helpers.mjs';

const ROOT_MODULE = '.';
const MAX_MESSAGE_LENGTH = 4000;

export function isBaseTestFailure(error, policy) {
  return error?.failures?.length > 0 && policy?.snapshot === 'base';
}

export function runOrNoteFailingTests(run, projectRoot, options) {
  try {
    run(projectRoot, { ...options, testsFailedModules: [] });
    return [];
  } catch (error) {
    if (!isBaseTestFailure(error, options.policy)) {
      throw error;
    }
    run(projectRoot, {
      ...options,
      testsFailedModules: error.failures.map(({ module }) => module),
    });
    return error.failures;
  }
}

export function testsFailedFinding(preset, { module, tests }) {
  const message = testsFailOnBase(tests, module === ROOT_MODULE ? '' : ` in ${module}`);
  return {
    tool: preset,
    rule: TESTS_FAILED_RULE,
    path: '.',
    identity: module === ROOT_MODULE ? TESTS_FAILED_RULE : `${TESTS_FAILED_RULE}:${module}`,
    message:
      message.length > MAX_MESSAGE_LENGTH ? `${message.slice(0, MAX_MESSAGE_LENGTH)}...` : message,
    classification: 'tool-error',
    symbol: module,
  };
}

export function withTestsFailures(findings, preset, failures = []) {
  return [...findings, ...failures.map((failure) => testsFailedFinding(preset, failure))];
}
