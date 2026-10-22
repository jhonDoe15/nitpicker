import { TESTS_FAILED_RULE } from '../../../../shared/rules/finding-helpers.mjs';

const TEST_TASK_FAILED =
  /Execution failed for task '[^']*:test'|Execution failed for task '[^']*'\.\s+> There were failing tests/u;
const MAX_MESSAGE_LENGTH = 4000;

export function gradleFailure(projectRoot, detail, raw = detail) {
  return Object.assign(new Error(`Java preset failed in ${projectRoot}: ${detail}`), {
    testsFailed: TEST_TASK_FAILED.test(raw),
    detail,
  });
}

export function isBaseTestFailure(error, policy) {
  return error?.testsFailed === true && policy?.snapshot === 'base';
}

export function runOrNoteFailingTests(run, projectRoot, options) {
  try {
    run(projectRoot, options);
    return undefined;
  } catch (error) {
    if (!isBaseTestFailure(error, options.policy)) {
      throw error;
    }
    run(projectRoot, { ...options, testsFailed: true });
    return error;
  }
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

export function withTestsFailure(findings, preset, testsFailure) {
  return testsFailure === undefined
    ? findings
    : [...findings, testsFailedFinding(preset, testsFailure.detail)];
}
