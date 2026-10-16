import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { RULE_IDS } from '../../../../shared/policy.mjs';
import { exceptionMatcher } from '../../../../shared/rules/exceptions.mjs';
import {
  slowestRuns,
  slowTestBudget,
  slowTestFindings,
} from '../../../../shared/rules/slow-tests/slow-test-finding.mjs';
import { readHeadPolicy, readLayout } from '../../preset/head-policy.mjs';
import { isIntegrationTest } from './integration-tests.mjs';
import { testCallsOf } from './test-calls.mjs';

const TEST_TIME_KEYS = ['unitTestSeconds', 'integrationTestSeconds'];
const MILLISECONDS = 1000;

function projectFile(projectRoot, name) {
  const relative = path.relative(projectRoot, String(name)).replaceAll('\\', '/');
  return relative.startsWith('..') || path.isAbsolute(relative) ? undefined : relative;
}

function passedRuns(report, projectRoot) {
  const results = Array.isArray(report?.testResults) ? report.testResults : [];
  return results.flatMap((result) =>
    (result?.assertionResults ?? [])
      .filter((run) => run?.status === 'passed' && Number.isFinite(run.duration))
      .map((run) => ({
        file: projectFile(projectRoot, result.name),
        name: run.fullName ?? run.title,
        seconds: run.duration / MILLISECONDS,
      }))
      .filter((run) => run.file !== undefined),
  );
}

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
  if (matched.length === 0) {
    return head !== base;
  }
  const baseCalls = testCallsOf(run.file, base);
  return matched.some(
    (call) => !baseCalls.some((old) => old.key === call.key && old.text === call.text),
  );
}

function chosenLimits(thresholds) {
  return Object.fromEntries(
    TEST_TIME_KEYS.filter((key) => thresholds[key] !== undefined).map((key) => [
      key,
      thresholds[key],
    ]),
  );
}

function slowRuns(report, options, { limits, exceptions }) {
  const budget = slowTestBudget(limits);
  const floor = Math.min(budget.unitTestSeconds, budget.integrationTestSeconds);
  const isExcepted = exceptionMatcher(exceptions);
  return slowestRuns(
    passedRuns(report, options.projectRoot).filter(
      (run) => run.seconds > floor && !isExcepted(RULE_IDS.slowTest, run.file),
    ),
    (run) => `${run.file}\0${run.name}`,
  );
}

function findingsFor(run, { options, limits, layout }) {
  const head = readOptional(options.projectRoot, run.file) ?? '';
  const base = readOptional(options.baselineRoot, run.file);
  if (options.baselineRoot !== undefined && !isEdited({ run, head, base })) {
    return [];
  }
  const matched = matchedCalls(run.file, head, run.name);
  return slowTestFindings({
    tool: options.analyzerName,
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

export function readSlowTestFindings(options, report) {
  if (options.snapshot === 'base') {
    return [];
  }
  const { thresholds, exceptions } = readHeadPolicy();
  const limits = chosenLimits(thresholds);
  const settings = { options, limits, layout: readLayout() };
  return slowRuns(report, options, { limits, exceptions }).flatMap((run) =>
    findingsFor(run, settings),
  );
}
