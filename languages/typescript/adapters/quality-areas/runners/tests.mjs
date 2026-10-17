import { runNodeTool, parseReportJson } from './tooling.mjs';
import path from 'node:path';
import { existsSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { trackTemporaryPath } from '../../../../../core/tooling/temporary-files.mjs';
import {
  coverageFailureFindings,
  readVitestReport,
  readCoverageFindings,
  toolErrorFinding,
  COVERAGE_REPORT_PATH,
  TEST_CONSOLE_REPORT_PATH,
} from '../reporting/vitest.mjs';
import { readLayout } from '../../../preset/head-policy.mjs';
import { TESTS_FAILED_SKIPPED_RULE } from '../../../../../shared/rules/finding-helpers.mjs';
import { normalizeCrap } from '../reporting/tests.mjs';
import { withFunctionSourceHashes } from '../reporting/source-hashes.mjs';
import { REPORT_VARIABLE } from '../../../preset/test-console/vitest-reporter.config.mjs';

export function runPolicyTests(options) {
  if (options.snapshot === 'base') {
    return [];
  }
  runNodeTool({
    options,
    relativeToolPath: 'vitest/vitest.mjs',
    arguments_: ['run', '--config', path.join(options.policyRoot, 'vitest.config.mts')],
    cwd: options.policyRoot,
    acceptedStatuses: [0],
  });
  return [];
}

const CONSOLE_REPORTER_PATH = 'languages/typescript/preset/test-console/vitest-reporter.config.mjs';

function prepareCoverageFiles(options) {
  const configPath = path.join(options.projectRoot, '.nitpicker-diff-vitest.config.ts');
  const testReportPath = path.join(options.projectRoot, '.nitpicker-diff-vitest-report.json');
  if (existsSync(testReportPath)) {
    throw new Error(`Temporary coverage report already exists: ${testReportPath}`);
  }
  const consoleReportPath = path.join(options.projectRoot, TEST_CONSOLE_REPORT_PATH);
  rmSync(consoleReportPath, { force: true });
  trackTemporaryPath(configPath);
  trackTemporaryPath(testReportPath);
  writeFileSync(
    configPath,
    readFileSync(
      path.join(
        options.policyRoot,
        'languages/typescript/preset/defaults/vitest.quality.config.ts',
      ),
      'utf8',
    ),
  );
  return { configPath, testReportPath, consoleReportPath };
}

export function runCoverage(options) {
  const { configPath, testReportPath, consoleReportPath } = prepareCoverageFiles(options);
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
        '10000',
        '--reporter',
        'json',
        '--outputFile',
        testReportPath,
        '--reporter',
        path.join(options.policyRoot, CONSOLE_REPORTER_PATH),
      ],
      environment: { [REPORT_VARIABLE]: consoleReportPath },
      acceptedStatuses: [0, 1],
    });
    if (result.status !== 0) {
      return coverageFailureFindings(options, readVitestReport(testReportPath, result), result);
    }
    return readCoverageFindings(options, testReportPath);
  } finally {
    rmSync(testReportPath, { force: true });
    rmSync(configPath, { force: true });
  }
}

function hasRunnableTests(options) {
  const layout = readLayout();
  return layout.projectCodeFiles(options.projectRoot).some(layout.isRunnableTestFile);
}

export function runCrap(options) {
  if (
    !existsSync(path.join(options.projectRoot, COVERAGE_REPORT_PATH)) &&
    hasRunnableTests(options)
  ) {
    return [
      toolErrorFinding(options, {
        rule: TESTS_FAILED_SKIPPED_RULE,
        message: 'CRAP did not run: there is no coverage report, because the project tests fail.',
      }),
    ];
  }
  runNodeTool({
    options,
    absoluteToolPath: path.join(options.policyRoot, 'languages/typescript/preset/crap/report.mjs'),
    arguments_: [],
    cwd: options.projectRoot,
    environment: { NITPICKER_PROJECT_ROOT: options.projectRoot },
    acceptedStatuses: [0],
  });
  const report = parseReportJson(
    readFileSync(path.join(options.projectRoot, 'reports/quality/crap/report.json'), 'utf8'),
  );
  return normalizeCrap(
    withFunctionSourceHashes(report, options.projectRoot),
    options.analyzerName,
    {
      scoreLimit: options.crapScoreLimit,
    },
  );
}
