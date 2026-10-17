import { readHeadPolicyFile } from '../../../../shared/head-policy.mjs';
import { testConsoleFindings } from '../../../../shared/console/console-findings.mjs';
import { projectRelative } from './slow-tests.mjs';

export const TEST_CONSOLE_TOOL = 'test-console';

export function consoleFacts(report, projectRoot) {
  return report.entries.map(({ file, test, messages }) => ({
    file: file === '' ? '' : projectRelative(projectRoot, file),
    test,
    messages,
  }));
}

export function consoleOutputFindings(report, { projectRoot, headPolicy = readHeadPolicyFile() }) {
  return testConsoleFindings(
    { entries: consoleFacts(report, projectRoot) },
    { analyzerName: TEST_CONSOLE_TOOL, allow: headPolicy.testConsole?.allow ?? [] },
  );
}
