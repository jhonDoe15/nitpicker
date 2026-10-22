import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { RULE_IDS } from '../../../../shared/policy.mjs';
import { exceptionMatcher } from '../../../../shared/rules/exceptions.mjs';
import {
  slowestRuns,
  slowTestBudget,
  slowTestFindings,
  slowTestLimits,
} from '../../../../shared/rules/slow-tests/slow-test-finding.mjs';
import { readHeadPolicy, readLayout } from '../../preset/head-policy.mjs';
import { isIntegrationTest } from './integration-tests.mjs';
import { passedRuns, runKey } from './report-runs.mjs';
import { retimeWithoutCoverage } from './rerun-timings.mjs';
import { testCallsOf } from './test-calls.mjs';

const SLOW_TEST_TOOL = 'test-runtime';

function readOptional(root, file) {
  const absolute = root === undefined ? undefined : path.join(root, file);
  return absolute !== undefined && existsSync(absolute)
    ? readFileSync(absolute, 'utf8')
    : undefined;
}

function matchedCalls(file, text, name) {
  const matched = testCallsOf(file, text).filter((call) => call.matcher.test(name));
  const named = matched.filter((call) => !call.dynamic);
  return named.length > 0 ? named : matched;
}

function isEdited({ run, head, base }) {
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

function slowRuns(report, { options, limits, exceptions, layout }) {
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

function isCounted(run, options) {
  if (options.baselineRoot === undefined) {
    return true;
  }
  const head = readOptional(options.projectRoot, run.file) ?? '';
  return isEdited({ run, head, base: readOptional(options.baselineRoot, run.file) });
}

function findingsFor(run, { options, limits, layout }) {
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
      ...(matched.length === 1 ? { line: matched[0].line } : {}),
    },
  });
}

export async function readSlowTestFindings(options, report, retime = retimeWithoutCoverage) {
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
