import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { slowTestFindings } from '../../../shared/rules/slow-tests/slow-test-finding.mjs';
import { SLOW_TESTS_REPORT } from './slow-test-step.mjs';

const SLOW_TEST_TOOL = 'test-runtime';
const NOT_TIMED_RULE = 'slow-test-not-timed';

function noticeFinding({ path: file, message }) {
  return {
    tool: SLOW_TEST_TOOL,
    rule: NOT_TIMED_RULE,
    path: file,
    identity: `${NOT_TIMED_RULE}:${file}`,
    message,
    classification: 'descriptive',
  };
}

export function readSlowTestFindings(reportRoot, limits) {
  const report = path.join(reportRoot, SLOW_TESTS_REPORT);
  if (!existsSync(report)) {
    return [];
  }
  const { tests, notices } = JSON.parse(readFileSync(report, 'utf8'));
  return [
    ...notices.map(noticeFinding),
    ...tests.flatMap((test) =>
      slowTestFindings({
        tool: SLOW_TEST_TOOL,
        language: 'python',
        advice: test.runner,
        test,
        integration: test.integration,
        limits,
      }),
    ),
  ];
}
