import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { slowTestFindings } from '../../../shared/rules/slow-tests/slow-test-finding.mjs';
import { SLOW_TESTS_REPORT } from './slow-test-step.mjs';

const SLOW_TEST_TOOL = 'test-runtime';

export function readSlowTestFindings(reportRoot, limits) {
  const report = path.join(reportRoot, SLOW_TESTS_REPORT);
  if (!existsSync(report)) {
    return [];
  }
  return JSON.parse(readFileSync(report, 'utf8'))
    .filter((test) => test.changed)
    .flatMap((test) =>
      slowTestFindings({
        tool: SLOW_TEST_TOOL,
        language: 'python',
        test,
        integration: test.integration,
        limits,
      }),
    );
}
