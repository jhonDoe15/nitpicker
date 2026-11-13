import path from 'node:path';
import { runProjectTests } from './run-project-tests.mts';
import { RUNNER_NAMES } from '../../preset/test-runner/runners.mjs';
import type { TestOptions, TestReport, TestRun } from './typed/runner-types.mts';
import type { TextOutput } from '../quality-areas/typed/area-types.mts';

type Rerun = {
  readonly options: TestOptions;
  readonly files: readonly string[];
  readonly output: TextOutput;
};

const PINNING_RUNNERS: ReadonlySet<string> = new Set([RUNNER_NAMES.vitest, RUNNER_NAMES.jest]);

function failedFiles(report: TestReport | undefined, projectRoot: string): string[] {
  const results = report?.testResults ?? [];
  return [
    ...new Set(
      results
        .filter((result) => result.status === 'failed' && typeof result.name === 'string')
        .map((result) => path.resolve(projectRoot, String(result.name))),
    ),
  ];
}

const MAX_RERUN_FILES = 20;
const RERUN_BUDGET_MS = 5 * 60 * 1000;

function note(output: TextOutput, text: string): void {
  output.write(`nitpicker: restoreMocks check: ${text}\n`);
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function rerunOnce(
  { options, files, output }: Rerun,
  withoutMockPin: boolean,
): Promise<TestRun | undefined> {
  try {
    return await runProjectTests({ ...options, rerun: { files, withoutMockPin } });
  } catch (error) {
    note(
      output,
      `the rerun ${withoutMockPin ? 'without' : 'with'} the pin did not finish: ${errorText(error)}`,
    );
    return undefined;
  }
}

function canCheckPin(options: TestOptions, run: TestRun): boolean {
  return (
    options.snapshot !== 'base' &&
    options.rerun === undefined &&
    PINNING_RUNNERS.has(run.runnerName)
  );
}

function filesToRerun(options: TestOptions, run: TestRun, output: TextOutput): string[] {
  if (!canCheckPin(options, run)) {
    return [];
  }
  const files = failedFiles(run.report, options.projectRoot);
  if (files.length > MAX_RERUN_FILES) {
    note(
      output,
      `${String(files.length)} test files fail, more than ${String(MAX_RERUN_FILES)}; not rerun`,
    );
    return [];
  }
  return files;
}

async function failsWithPin(rerun: Rerun): Promise<boolean> {
  const pinned = await rerunOnce(rerun, false);
  if (pinned !== undefined && !pinned.failed) {
    note(
      rerun.output,
      'the failing tests pass when rerun with the pin, so the failure is not caused by it',
    );
  }
  return pinned?.failed === true;
}

export async function passesWithoutMockPin(
  options: TestOptions,
  run: TestRun,
  output: TextOutput,
): Promise<boolean> {
  const files = filesToRerun(options, run, output);
  if (files.length === 0) {
    return false;
  }
  const rerun = { options, files, output };
  const started = Date.now();
  if (!(await failsWithPin(rerun))) {
    return false;
  }
  if (Date.now() - started > RERUN_BUDGET_MS) {
    note(output, 'the control rerun took too long; the unpinned rerun was skipped');
    return false;
  }
  const unpinned = await rerunOnce(rerun, true);
  return unpinned !== undefined && !unpinned.failed && (unpinned.report.numTotalTests ?? 0) > 0;
}
