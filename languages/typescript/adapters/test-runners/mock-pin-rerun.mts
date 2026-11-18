import path from 'node:path';
import { runProjectTests } from './run-project-tests.mts';
import { RUNNER_NAMES } from '../../preset/test-runner/runners.mjs';
import type { TestOptions, TestReport, TestRun } from './typed/runner-types.mts';
import type { TextOutput } from '../quality-areas/typed/area-types.mts';
import {
  NO_RERUN_VERDICT,
  type RerunVerdict,
  testKey,
} from '../quality-areas/reporting/reruns/rerun-groups.mts';

type Outcomes = { readonly failed: ReadonlySet<string>; readonly passed: ReadonlySet<string> };
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

function testsWithStatus(
  report: TestReport | undefined,
  { projectRoot, status }: { readonly projectRoot: string; readonly status: string },
): Set<string> {
  return new Set(
    (report?.testResults ?? []).flatMap((result) => {
      const file = path
        .relative(projectRoot, path.resolve(projectRoot, String(result.name)))
        .replaceAll('\\', '/');
      return (result.assertionResults ?? [])
        .filter((assertion) => assertion.status === status)
        .map((assertion) =>
          testKey(file, assertion.fullName ?? assertion.title ?? '<unknown test>'),
        );
    }),
  );
}

function outcomes(report: TestReport | undefined, projectRoot: string): Outcomes {
  return {
    failed: testsWithStatus(report, { projectRoot, status: 'failed' }),
    passed: testsWithStatus(report, { projectRoot, status: 'passed' }),
  };
}

function both(left: ReadonlySet<string>, right: ReadonlySet<string>): Set<string> {
  return new Set([...left].filter((key) => right.has(key)));
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

export async function mockPinVerdict(
  options: TestOptions,
  run: TestRun,
  output: TextOutput,
): Promise<RerunVerdict> {
  const files = filesToRerun(options, run, output);
  if (files.length === 0) {
    return NO_RERUN_VERDICT;
  }
  const rerun = { options, files, output };
  const started = Date.now();
  const control = await rerunOnce(rerun, false);
  return control === undefined
    ? NO_RERUN_VERDICT
    : verdictAfterControl(rerun, { first: run, control, started });
}

async function verdictAfterControl(
  rerun: Rerun,
  {
    first,
    control,
    started,
  }: { readonly first: TestRun; readonly control: TestRun; readonly started: number },
): Promise<RerunVerdict> {
  const { options, output } = rerun;
  const firstFailed = outcomes(first.report, options.projectRoot).failed;
  const pinnedRun = outcomes(control.report, options.projectRoot);
  const loadSensitive = both(firstFailed, pinnedRun.passed);
  const stillFailing = both(firstFailed, pinnedRun.failed);
  if (stillFailing.size === 0) {
    note(
      output,
      'the failing tests pass when rerun with the pin, so the failure is not caused by it',
    );
    return { pinned: new Set(), loadSensitive };
  }
  if (Date.now() - started > RERUN_BUDGET_MS) {
    note(output, 'the control rerun took too long; the unpinned rerun was skipped');
    return { pinned: new Set(), loadSensitive };
  }
  const unpinned = await rerunOnce(rerun, true);
  const unpinnedRun = outcomes(unpinned?.report, options.projectRoot);
  return { pinned: both(stillFailing, unpinnedRun.passed), loadSensitive };
}
