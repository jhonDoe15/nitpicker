import { readGoModule } from '../execution/go-module.mjs';
import {
  parseRaces,
  raceFindings,
  raceNotCheckedFinding,
  raceOnlyFailureFinding,
} from './race-reports.mjs';
import { readRaceCheck } from './race-run.mjs';

function raceOnlyIds(check) {
  return new Set((check.raceOnly ?? []).map(({ id }) => id));
}

export function withoutRaceOnlyFailures(testRun, reportRoot) {
  const raceOnly = raceOnlyIds(readRaceCheck(reportRoot));
  return { ...testRun, failures: testRun.failures.filter(({ id }) => !raceOnly.has(id)) };
}

function unexplainedFailures(check, testRun) {
  const raced = new Set(testRun.raceOutputs.map(({ package: name }) => name));
  const byPackage = new Map();
  for (const { id, package: name } of check.raceOnly ?? []) {
    if (!raced.has(name)) {
      byPackage.set(name, [...(byPackage.get(name) ?? []), id.slice(name.length + 1) || name]);
    }
  }
  return [...byPackage].map(([name, tests]) => raceOnlyFailureFinding(name, tests));
}

export function raceCheckFindings(context, testRun) {
  const check = readRaceCheck(context.reportRoot);
  if (!check.checked) {
    return [raceNotCheckedFinding(check.reason)];
  }
  const module = { root: context.projectRoot, path: readGoModule(context.projectRoot)?.module };
  return [
    ...raceFindings(
      testRun.raceOutputs.flatMap(({ test, output }) =>
        parseRaces(output, module).map((accesses) => ({ accesses, test })),
      ),
    ),
    ...unexplainedFailures(check, testRun),
  ];
}
