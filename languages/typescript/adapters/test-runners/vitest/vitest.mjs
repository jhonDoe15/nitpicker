import path from 'node:path';
import { timeoutSetupSource } from './test-timeouts-setup.mjs';
import { readHeadPolicyFile } from '../../../../../shared/head-policy.mjs';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { runNodeTool } from '../../quality-areas/runners/tooling.mjs';
import { readRun, removeTemporary, temporaryProjectPath, testTimeouts } from '../test-run.mjs';
import { RUNNER_NAMES } from '../../../preset/test-runner/runners.mjs';
import { consoleProducerPath, startTestConsole } from '../test-console-run.mjs';
import { projectTestRetry } from '../../../preset/project-configs/test-runner/test-runner-config.mjs';
import { vitestRetryArguments } from '../../../preset/project-configs/test-runner/test-retry.mjs';
import { FAILURE_DETAILS_VARIABLE } from '../../../preset/test-failures/vitest-failure-details.config.mjs';

const TIMEOUT_SETUP_VARIABLE = 'NITPICKER_TEST_TIMEOUT_SETUP';
const TIMEOUT_LIMITS_VARIABLE = 'NITPICKER_TEST_TIMEOUT_LIMITS';

const QUALITY_CONFIG = 'languages/typescript/preset/defaults/vitest.quality.config.ts';
const FAILURE_DETAILS_REPORTER =
  'languages/typescript/preset/test-failures/vitest-failure-details.config.mjs';

function takeDetail(details, file, name) {
  const index = details.findIndex((detail) => detail.file === file && detail.name === name);
  return index === -1 ? undefined : details.splice(index, 1)[0];
}

function addFailureDetails(testResult, details) {
  for (const assertion of testResult.assertionResults ?? []) {
    const detail =
      assertion.status === 'failed'
        ? takeDetail(details, testResult.name, assertion.fullName)
        : undefined;
    if (detail?.expected !== undefined) {
      assertion.failureDetails = [
        { expected: detail.expected, actual: detail.actual, formatted: true },
      ];
    }
  }
}

function withFailureDetails(run, detailsPath) {
  if (!run.failed || !existsSync(detailsPath)) {
    return run;
  }
  const details = JSON.parse(readFileSync(detailsPath, 'utf8'));
  for (const testResult of run.report.testResults ?? []) {
    addFailureDetails(testResult, details);
  }
  return run;
}

export function runVitest(options) {
  const configured = readHeadPolicyFile().tools?.tests?.timeouts !== undefined;
  const configPath = temporaryProjectPath(options, 'vitest.config.ts');
  const setupPath = temporaryProjectPath(options, 'test-timeouts.mjs');
  const reportPath = temporaryProjectPath(options, 'vitest-report.json');
  const detailsPath = temporaryProjectPath(options, 'vitest-failure-details.json');
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
        ...vitestRetryArguments(projectTestRetry('vitest')),
        '--reporter',
        'json',
        '--outputFile',
        reportPath,
        '--reporter',
        path.join(options.policyRoot, FAILURE_DETAILS_REPORTER),
        ...(options.rerun?.files ?? []),
        ...(testConsole.enabled ? ['--reporter', consoleProducerPath(options, 'vitest')] : []),
      ],
      environment: {
        ...testConsole.environment,
        [FAILURE_DETAILS_VARIABLE]: detailsPath,
        ...(configured
          ? {
              [TIMEOUT_SETUP_VARIABLE]: setupPath,
              [TIMEOUT_LIMITS_VARIABLE]: JSON.stringify(testTimeouts()),
            }
          : {}),
      },
      acceptedStatuses: [0, 1],
    });
    return withFailureDetails(
      readRun({ reportPath, result, runnerName: RUNNER_NAMES.vitest }),
      detailsPath,
    );
  } finally {
    removeTemporary(reportPath, detailsPath, configPath, setupPath);
  }
}
