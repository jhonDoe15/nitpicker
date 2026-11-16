import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { TESTS_NOT_RUN_RULE } from '../../../../shared/rules/finding-helpers.mjs';
import { fieldOf } from '../../../../shared/values/readers.mts';
import { failure, run } from '../execution/python-process.mts';
import {
  NO_TESTS_EXIT,
  testCommand,
  testDirectory,
  testEnvironment,
  testsRan,
} from '../execution/python-test-runner.mts';
import { insideProject } from '../../libraries/project-files.mts';
import { writeCoverageConfig } from '../configuration/coverage-config/python-coverage-config.mts';
import { failedTests, readJunit } from './junit-results.mts';
import { unittestFailures } from './test-failures.mts';
import { consoleReportEnvironment } from '../test-results/console-output.mts';
import type { SpawnResult } from '../execution/typed/process-types.mts';
import type { ToolContext, ToolOutcome } from '../typed/context/tool-context-types.mts';
import type { TestFailure } from './typed/run-types.mts';

export const COVERAGE_REPORT = 'coverage.json';
const COVERAGE_DATA = '.coverage';
const COVERAGE = 'coverage';
const RCFILE = '--rcfile';
const TESTS_FAILED_EXIT = 1;
const EMPTY_COVERAGE_REPORT = '{"files":{}}';

function coverageSources({ projectRoot, project }: ToolContext): string[] {
  return project.sourceRoots.filter((root) => existsSync(insideProject(projectRoot, root)));
}

function combineCoverageData(context: ToolContext, config: string): void {
  const parallel = readdirSync(context.reportRoot).some((name) =>
    name.startsWith(`${COVERAGE_DATA}.`),
  );
  if (parallel) {
    run(context, [COVERAGE, 'combine', RCFILE, config], { rule: 'coverage-failed' });
  }
}

function failuresOf(
  context: ToolContext,
  { command, result }: { readonly command: readonly string[]; readonly result: SpawnResult },
): TestFailure[] {
  if (result.status !== TESTS_FAILED_EXIT) {
    return [];
  }
  const failed =
    context.project.testRunner === 'pytest'
      ? failedTests(readJunit(context.reportRoot)).map(({ id, file, name, failure }) => ({
          id,
          file,
          notRun: name === undefined,
          failure,
        }))
      : unittestFailures(result.stderr, context.projectRoot);
  if (failed.length === 0) {
    throw failure({ context, command, result, rule: TESTS_NOT_RUN_RULE });
  }
  return failed;
}

export class TestRunError extends Error {
  readonly outcome: ToolOutcome;
  readonly rule: unknown;

  constructor(cause: unknown, outcome: ToolOutcome) {
    super(cause instanceof Error ? cause.message : String(cause), { cause });
    this.outcome = outcome;
    this.rule = fieldOf(cause, 'rule');
  }
}

export function test(context: ToolContext): ToolOutcome {
  const sources = coverageSources(context);
  const config = writeCoverageConfig(context, sources);
  const command = [COVERAGE, 'run', RCFILE, config, ...testCommand(context)];
  const result = run(context, command, {
    accepted: [0, TESTS_FAILED_EXIT, NO_TESTS_EXIT],
    rule: TESTS_NOT_RUN_RULE,
    env: { ...testEnvironment(context), ...consoleReportEnvironment(context) },
    cwd: testDirectory(context),
  });
  const ran = testsRan(result);
  let testFailures: TestFailure[] | undefined;
  try {
    testFailures = failuresOf(context, { command, result });
    combineCoverageData(context, config);
    writeCoverageReport(context, { config, measured: sources.length > 0 });
  } catch (error) {
    throw new TestRunError(
      error,
      testFailures === undefined ? { testsRan: ran } : { testsRan: ran, testFailures },
    );
  }
  return { testsRan: ran, testFailures };
}

function writeCoverageReport(
  context: ToolContext,
  { config, measured }: { readonly config: string; readonly measured: boolean },
): void {
  const report = path.join(context.reportRoot, COVERAGE_REPORT);
  if (!measured) {
    writeFileSync(report, EMPTY_COVERAGE_REPORT);
    return;
  }
  run(
    context,
    [COVERAGE, 'json', RCFILE, config, '-o', report, '--fail-under=0', '--ignore-errors'],
    { rule: 'coverage-failed' },
  );
}
