import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { runNodeTool } from '../../quality-areas/runners/tooling.mjs';
import { TEST_TIMEOUT_MS } from '../coverage-globs.mjs';

const VITEST_QUALITY_CONFIG = 'languages/typescript/preset/defaults/vitest.quality.config.ts';

export function runVitestWithCoverage({ options, reportPath, register }) {
  const configPath = register(path.join(options.projectRoot, '.nitpicker-diff-vitest.config.ts'));
  writeFileSync(
    configPath,
    readFileSync(path.join(options.policyRoot, VITEST_QUALITY_CONFIG), 'utf8'),
  );
  return runNodeTool({
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
}
