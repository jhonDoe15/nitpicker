import path from 'node:path';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { runNodeTool } from '../../quality-areas/runners/tooling.mjs';
import { readRun, removeTemporary, temporaryProjectPath, testTimeoutMs } from '../test-run.mjs';
import { RUNNER_NAMES } from '../../../preset/test-runner/runners.mjs';

import { TEST_CONSOLE_REPORT_PATH } from '../../quality-areas/reporting/test-report.mjs';
import { REPORT_VARIABLE } from '../../../preset/test-console/vitest-reporter.config.mjs';

const CONSOLE_REPORTER = 'languages/typescript/preset/test-console/vitest-reporter.config.mjs';
const QUALITY_CONFIG = 'languages/typescript/preset/defaults/vitest.quality.config.ts';

export function runVitest(options) {
  const configPath = temporaryProjectPath(options, 'vitest.config.ts');
  const reportPath = temporaryProjectPath(options, 'vitest-report.json');
  writeFileSync(configPath, readFileSync(path.join(options.policyRoot, QUALITY_CONFIG), 'utf8'));
  const consoleReportPath = path.join(options.projectRoot, TEST_CONSOLE_REPORT_PATH);
  rmSync(consoleReportPath, { force: true });
  try {
    const result = runNodeTool({
      options,
      relativeToolPath: 'vitest/vitest.mjs',
      arguments_: [
        'run',
        '--config',
        configPath,
        ...(options.rerun === undefined
          ? ['--coverage']
          : ['--maxWorkers=1', '--testNamePattern', options.rerun.namePattern]),
        '--testTimeout',
        String(testTimeoutMs()),
        '--reporter',
        'json',
        '--outputFile',
        reportPath,
        ...(options.rerun?.files ?? []),
        '--reporter',
        path.join(options.policyRoot, CONSOLE_REPORTER),
      ],
      environment: { [REPORT_VARIABLE]: consoleReportPath },
      acceptedStatuses: [0, 1],
    });
    return readRun({ reportPath, result, runnerName: RUNNER_NAMES.vitest });
  } finally {
    removeTemporary(reportPath, configPath);
  }
}
