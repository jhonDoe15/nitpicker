import {
  parseRaces,
  raceFindings,
  raceNotCheckedFinding,
  raceOnlyFailureFinding,
  readGoModule,
  readRaceCheck,
} from '../typed/go-readers.mts';
import type { RaceCheck } from '../typed/go-readers.mts';
import type { FindingRow, TestRun } from '../go-types.mts';

function raceOnlyIds(check: RaceCheck) {
  return new Set((check.raceOnly ?? []).map(({ id }) => id));
}

export function withoutRaceOnlyFailures<Run extends Pick<TestRun, 'failures'>>(
  testRun: Run,
  reportRoot: string,
): Run {
  const raceOnly = raceOnlyIds(readRaceCheck(reportRoot));
  return { ...testRun, failures: testRun.failures.filter(({ id }) => !raceOnly.has(id)) };
}

function unexplainedFailures(check: RaceCheck, testRun: Pick<TestRun, 'raceOutputs'>) {
  const raced = new Set(testRun.raceOutputs.map(({ package: name }) => name));
  const byPackage = new Map<string, string[]>();
  for (const { id, package: name } of check.raceOnly ?? []) {
    if (!raced.has(name)) {
      byPackage.set(name, [...(byPackage.get(name) ?? []), id.slice(name.length + 1) || name]);
    }
  }
  return [...byPackage].map(([name, tests]) => raceOnlyFailureFinding(name, tests));
}

export function raceCheckFindings(
  context: { reportRoot: string; projectRoot: string },
  testRun: Pick<TestRun, 'raceOutputs'>,
): FindingRow[] {
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
