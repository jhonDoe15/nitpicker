import { TESTS_FAILED_RULE } from '../../../../shared/rules/finding-helpers.mjs';

const TEST_TASK_FAILED =
  /Execution failed for task '[^']*:test'|Execution failed for task '[^']*'\.\s+> There were failing tests/u;
const MAX_MESSAGE_LENGTH = 4000;

export function gradleFailure(projectRoot, detail) {
  return Object.assign(new Error(`Java preset failed in ${projectRoot}: ${detail}`), {
    testsFailed: TEST_TASK_FAILED.test(detail),
    detail,
  });
}

export function isBaseTestFailure(error, policy) {
  return error?.testsFailed === true && policy?.snapshot === 'base';
}

export function testsFailedFinding(preset, detail) {
  return {
    tool: preset,
    rule: TESTS_FAILED_RULE,
    path: '.',
    identity: TESTS_FAILED_RULE,
    message:
      detail.length > MAX_MESSAGE_LENGTH ? `${detail.slice(0, MAX_MESSAGE_LENGTH)}...` : detail,
    classification: 'tool-error',
  };
}
