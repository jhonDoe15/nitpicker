import path from 'node:path';
import { timeoutSetupSource } from './test-timeouts-setup.mts';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { runNodeTool } from '../../quality-areas/typed/tooling.mts';
import {
  projectTestRetry,
  readHeadPolicyFile,
  vitestRetryArguments,
} from '../typed/runner-tools.mts';
import type { TestFileResult, TestOptions, TestRun } from '../typed/runner-types.mts';
import { fieldOf, listOf } from '../../../../../shared/values/readers.mts';
import { readRun, removeTemporary, temporaryProjectPath, testTimeouts } from '../test-run.mts';
import { RUNNER_NAMES } from '../../../preset/test-runner/runners.mjs';
import { consoleProducerPath, startTestConsole } from '../test-console-run.mts';
import { FAILURE_DETAILS_VARIABLE } from '../../../preset/test-failures/vitest-failure-details.config.mjs';

const TIMEOUT_SETUP_VARIABLE = 'NITPICKER_TEST_TIMEOUT_SETUP';
const TIMEOUT_LIMITS_VARIABLE = 'NITPICKER_TEST_TIMEOUT_LIMITS';

const QUALITY_CONFIG = 'languages/typescript/preset/defaults/vitest.quality.config.ts';
const FAILURE_DETAILS_REPORTER =
  'languages/typescript/preset/test-failures/vitest-failure-details.config.mjs';

type RecordedDetail = {
  readonly file?: unknown;
  readonly name?: unknown;
  readonly expected?: unknown;
  readonly actual?: unknown;
};

function takeDetail(
  details: RecordedDetail[],
  file: string | undefined,
  name: string | undefined,
): RecordedDetail | undefined {
  const index = details.findIndex((detail) => detail.file === file && detail.name === name);
  return index === -1 ? undefined : details.splice(index, 1)[0];
}

function addFailureDetails(testResult: TestFileResult, details: RecordedDetail[]): void {
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

function withFailureDetails(run: TestRun, detailsPath: string): TestRun {
  if (!run.failed || !existsSync(detailsPath)) {
    return run;
  }
  const details: RecordedDetail[] = listOf(JSON.parse(readFileSync(detailsPath, 'utf8'))).map(
    (detail) => ({
      file: fieldOf(detail, 'file'),
      name: fieldOf(detail, 'name'),
      expected: fieldOf(detail, 'expected'),
      actual: fieldOf(detail, 'actual'),
    }),
  );
  for (const testResult of run.report.testResults ?? []) {
    addFailureDetails(testResult, details);
  }
  return run;
}

function reportArguments(options: TestOptions, reportPath: string): string[] {
  return [
    '--reporter',
    'json',
    '--outputFile',
    reportPath,
    '--reporter',
    path.join(options.policyRoot, FAILURE_DETAILS_REPORTER),
  ];
}

function timeoutEnvironment(setupPath: string): Readonly<Record<string, string>> {
  return {
    [TIMEOUT_SETUP_VARIABLE]: setupPath,
    [TIMEOUT_LIMITS_VARIABLE]: JSON.stringify(testTimeouts()),
  };
}

export function runVitest(options: TestOptions): TestRun {
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
        ...reportArguments(options, reportPath),
        ...(options.rerun?.files ?? []),
        ...(testConsole.enabled ? ['--reporter', consoleProducerPath(options, 'vitest')] : []),
      ],
      environment: {
        ...testConsole.environment,
        [FAILURE_DETAILS_VARIABLE]: detailsPath,
        ...(configured ? timeoutEnvironment(setupPath) : {}),
      },
      acceptedStatuses: [0, 1],
    });
    return withFailureDetails(
      readRun({
        reportPath,
        result,
        runnerName: RUNNER_NAMES.vitest,
        snapshot: options.snapshot,
      }),
      detailsPath,
    );
  } finally {
    removeTemporary(reportPath, detailsPath, configPath, setupPath);
  }
}
