import { TESTS_FAILED_RULE } from '../../../../shared/rules/finding-helpers.mjs';
import { withGradleLog } from '../gradle-wrapper/diagnostics/failure-log.mjs';
import { condenseFailure } from '../gradle-wrapper/diagnostics/failure-text.mjs';
import { failingTestsOf } from '../gradle-reports/failing-tests.mjs';

const TEST_TASK_FAILED =
  /Execution failed for task '[^']*:test'|Execution failed for task '[^']*'\.\s+> There were failing tests/u;
const MAX_MESSAGE_LENGTH = 4000;
const MAX_FAILURE_LENGTH = 3500;

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

export function assertGradleSucceeded(result, projectRoot, { reportBase, since }) {
  if (result.error === undefined && result.status === 0) {
    return;
  }
  const raw = result.stderr?.trim() ? result.stderr : (result.stdout ?? '');
  const detail = condenseFailure(raw, MAX_FAILURE_LENGTH);
  const reported =
    result.error === undefined ? failingTestsOf(projectRoot, { reportBase, since }) : undefined;
  const failure =
    result.error ?? reported ?? gradleFailure(projectRoot, detail || 'no diagnostic output', raw);
  throw Object.assign(withGradleLog(failure, result), {
    testsFailed: reported !== undefined || failure.testsFailed === true,
    detail: failure.detail,
  });
}

export function withTestsFailure(findings, preset, testsFailure) {
  return testsFailure === undefined
    ? findings
    : [...findings, testsFailedFinding(preset, testsFailure.detail)];
}
