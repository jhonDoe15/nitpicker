import path from 'node:path';
import { readFileSync, writeFileSync } from 'node:fs';
import { runNodeTool } from '../../quality-areas/runners/tooling.mjs';
import { TEST_TIMEOUT_MS, readRun, removeTemporary, temporaryProjectPath } from '../test-run.mjs';
import { RUNNER_NAMES } from '../../../preset/test-runner/runners.mjs';

const QUALITY_CONFIG = 'languages/typescript/preset/defaults/vitest.quality.config.ts';

export function runVitest(options) {
  const configPath = temporaryProjectPath(options, 'vitest.config.ts');
  const reportPath = temporaryProjectPath(options, 'vitest-report.json');
  writeFileSync(configPath, readFileSync(path.join(options.policyRoot, QUALITY_CONFIG), 'utf8'));
  try {
    const result = runNodeTool({
      options,
      relativeToolPath: 'vitest/vitest.mjs',
      arguments_: [
        'run',
        '--config',
        configPath,
        '--coverage',
        '--testTimeout',
        String(TEST_TIMEOUT_MS),
        '--reporter',
        'json',
        '--outputFile',
        reportPath,
      ],
      acceptedStatuses: [0, 1],
    });
    return readRun({ reportPath, result, runnerName: RUNNER_NAMES.vitest });
  } finally {
    removeTemporary(reportPath, configPath);
  }
}
