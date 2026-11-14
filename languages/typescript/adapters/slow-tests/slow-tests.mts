import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { RULE_IDS } from '../../../../shared/policy.mjs';
import {
  type TestRunTime,
  type TestTimeLimits,
  exceptionMatcher,
  slowestRuns,
  slowTestBudget,
  slowTestFindings,
  slowTestLimits,
} from './slow-test-rules.mts';
import { type Layout, readHeadPolicy, readLayout } from '../typed/head-policy.mts';
import type { Finding } from '../static-checks/shared.mts';
import type { TestOptions, TestReport } from '../test-runners/typed/runner-types.mts';
import { type TestCall, testCallsOf } from './test-calls.mts';
import { isIntegrationTest } from './integration-tests.mts';
import { passedRuns, runKey } from './report-runs.mts';
import { retimeWithoutCoverage } from './rerun-timings.mts';

type SlowTestSettings = {
  readonly options: TestOptions;
  readonly limits: TestTimeLimits;
  readonly exceptions: readonly unknown[];
  readonly layout: Layout;
};

type Retime = (
  options: TestOptions,
  suspects: readonly TestRunTime[],
) => Promise<ReadonlyMap<string, number>>;

const SLOW_TEST_TOOL = 'test-runtime';

function readOptional(root: string | undefined, file: string): string | undefined {
  const absolute = root === undefined ? undefined : path.join(root, file);
  return absolute !== undefined && existsSync(absolute)
    ? readFileSync(absolute, 'utf8')
    : undefined;
}

function matchedCalls(file: string, text: string, name: string): TestCall[] {
  const matched = testCallsOf(file, text).filter((call) => call.matcher.test(name));
  const named = matched.filter((call) => !call.dynamic);
  return named.length > 0 ? named : matched;
}

function isEdited({
  run,
  head,
  base,
}: {
  readonly run: TestRunTime;
  readonly head: string;
  readonly base: string | undefined;
}): boolean {
  if (base === undefined) {
    return true;
  }
  const matched = matchedCalls(run.file, head, run.name);
  if (matched.length === 0 || matched.every((call) => call.fileLevel)) {
    return head !== base;
  }
  const baseCalls = testCallsOf(run.file, base);
  return matched.some(
    (call) => !baseCalls.some((old) => old.key === call.key && old.text === call.text),
  );
}

function slowRuns(
  report: TestReport,
  { options, limits, exceptions, layout }: SlowTestSettings,
): TestRunTime[] {
  const budget = slowTestBudget(limits);
  const floor = Math.min(budget.unitTestSeconds, budget.integrationTestSeconds);
  const isExcepted = exceptionMatcher(exceptions);
  return slowestRuns(
    passedRuns(report, options.projectRoot).filter(
      (run) =>
        run.seconds > floor &&
        !layout.isExcluded(run.file) &&
        !isExcepted(RULE_IDS.slowTest, run.file),
    ),
    runKey,
  );
}

function isCounted(run: TestRunTime, options: TestOptions): boolean {
  if (options.baselineRoot === undefined) {
    return true;
  }
  const head = readOptional(options.projectRoot, run.file) ?? '';
  return isEdited({ run, head, base: readOptional(options.baselineRoot, run.file) });
}

function findingsFor(run: TestRunTime, { options, limits, layout }: SlowTestSettings): Finding[] {
  const head = readOptional(options.projectRoot, run.file) ?? '';
  const matched = matchedCalls(run.file, head, run.name);
  return slowTestFindings({
    tool: SLOW_TEST_TOOL,
    language: 'typescript',
    integration: isIntegrationTest(run.file, layout),
    limits,
    test: {
      path: run.file,
      name: `${path.posix.basename(run.file)} ${run.name}`,
      identity: `test:${run.name}`,
      seconds: run.seconds,
      ...(matched.length === 1 && matched[0] !== undefined ? { line: matched[0].line } : {}),
    },
  });
}

export async function readSlowTestFindings(
  options: TestOptions,
  report: TestReport,
  retime: Retime = retimeWithoutCoverage,
): Promise<Finding[]> {
  if (options.snapshot === 'base') {
    return [];
  }
  const { thresholds, exceptions } = readHeadPolicy();
  const settings = {
    options,
    limits: slowTestLimits(thresholds),
    exceptions,
    layout: readLayout(),
  };
  const suspects = slowRuns(report, settings).filter((run) => isCounted(run, options));
  if (suspects.length === 0) {
    return [];
  }
  const timings = await retime(options, suspects);
  return suspects.flatMap((run) =>
    findingsFor({ ...run, seconds: timings.get(runKey(run)) ?? run.seconds }, settings),
  );
}
