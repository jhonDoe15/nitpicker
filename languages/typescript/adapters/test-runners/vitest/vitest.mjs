import path from 'node:path';
import { timeoutSetupSource } from './test-timeouts-setup.mjs';
import { readHeadPolicyFile } from '../../../../../shared/head-policy.mjs';
import { readFileSync, writeFileSync } from 'node:fs';
import { runNodeTool } from '../../quality-areas/runners/tooling.mjs';
import { readRun, removeTemporary, temporaryProjectPath, testTimeouts } from '../test-run.mjs';
import { RUNNER_NAMES } from '../../../preset/test-runner/runners.mjs';
import { consoleProducerPath, startTestConsole } from '../test-console-run.mjs';
import { vitestRetryArguments } from '../../../preset/project-configs/test-runner-config.mjs';

const TIMEOUT_SETUP_VARIABLE = 'NITPICKER_TEST_TIMEOUT_SETUP';
const TIMEOUT_LIMITS_VARIABLE = 'NITPICKER_TEST_TIMEOUT_LIMITS';

const QUALITY_CONFIG = 'languages/typescript/preset/defaults/vitest.quality.config.ts';

export function runVitest(options) {
  const configured = readHeadPolicyFile().tools?.tests?.timeouts !== undefined;
  const configPath = temporaryProjectPath(options, 'vitest.config.ts');
  const setupPath = temporaryProjectPath(options, 'test-timeouts.mjs');
  const reportPath = temporaryProjectPath(options, 'vitest-report.json');
  writeFileSync(setupPath, timeoutSetupSource(options.policyRoot));
  writeFileSync(configPath, readFileSync(path.join(options.policyRoot, QUALITY_CONFIG), 'utf8'));
  const testConsole = startTestConsole(options, { collectsLines: false });
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
        ...(configured ? [] : ['--testTimeout', String(testTimeouts().testTimeoutMs)]),
        ...vitestRetryArguments(),
        '--reporter',
        'json',
        '--outputFile',
        reportPath,
        ...(options.rerun?.files ?? []),
        ...(testConsole.enabled ? ['--reporter', consoleProducerPath(options, 'vitest')] : []),
      ],
      environment: {
        ...testConsole.environment,
        ...(configured
          ? {
              [TIMEOUT_SETUP_VARIABLE]: setupPath,
              [TIMEOUT_LIMITS_VARIABLE]: JSON.stringify(testTimeouts()),
            }
          : {}),
      },
      acceptedStatuses: [0, 1],
    });
    return readRun({ reportPath, result, runnerName: RUNNER_NAMES.vitest });
  } finally {
    removeTemporary(reportPath, configPath, setupPath);
  }
}
