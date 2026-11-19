import { type Failure, failingTestEntries, testsFailHeadline } from '../../typed/reporting.mts';
import { mockPinHeadline } from '../failure-lines.mts';

export type RerunVerdict = {
  readonly pinned: ReadonlySet<string>;
  readonly loadSensitive: ReadonlySet<string>;
};

type Groups = {
  readonly genuine: readonly Failure[];
  readonly pinned: readonly Failure[];
  readonly loadSensitive: readonly Failure[];
};

export const NO_RERUN_VERDICT: RerunVerdict = { pinned: new Set(), loadSensitive: new Set() };
const SKIPPED = 'coverage, CRAP and mutation were skipped';

export function testKey(file: string, name: string): string {
  return `${file} > ${name}`;
}

function keyOf({ file, name }: Failure): string {
  return testKey(file, name);
}

function grouped(failures: readonly Failure[], verdict: RerunVerdict): Groups {
  return {
    genuine: failures.filter(
      (failure) =>
        !(verdict.pinned.has(keyOf(failure)) || verdict.loadSensitive.has(keyOf(failure))),
    ),
    pinned: failures.filter((failure) => verdict.pinned.has(keyOf(failure))),
    loadSensitive: failures.filter((failure) => verdict.loadSensitive.has(keyOf(failure))),
  };
}

function entries(failures: readonly Failure[]): string[] {
  return failingTestEntries(
    failures.map(({ assertion, ...failure }) => ({ ...failure, message: assertion })),
  );
}

function tests(count: number, more = false): string {
  return `${String(count)}${more ? ' more' : ''} ${count === 1 ? 'test' : 'tests'}`;
}

function loadSensitiveText(count: number, more: boolean): string {
  const which = tests(count, more);
  const verb = count === 1 ? 'it looks' : 'they look';
  return (
    `${which} failed in the first run and passed when rerun, so ${verb} load-sensitive or flaky` +
    `${more ? '' : `; ${SKIPPED}`}. ` +
    'Make the assertions independent of timing and machine load, and rerun:'
  );
}

function pinnedText(count: number, runnerName: string | undefined): string {
  return `Also, ${mockPinHeadline(count, runnerName)}`;
}

export function failureGroupLines(
  failures: readonly Failure[],
  {
    verdict,
    failedCount,
    runnerName,
  }: {
    readonly verdict: RerunVerdict;
    readonly failedCount: number;
    readonly runnerName: string | undefined;
  },
): string[] {
  const { genuine, pinned, loadSensitive } = grouped(failures, verdict);
  if (genuine.length > 0) {
    const count = pinned.length + loadSensitive.length === 0 ? failedCount : genuine.length;
    return [
      testsFailHeadline(count, SKIPPED),
      ...entries(genuine),
      ...(pinned.length === 0 ? [] : [pinnedText(pinned.length, runnerName), ...entries(pinned)]),
      ...(loadSensitive.length === 0
        ? []
        : [loadSensitiveText(loadSensitive.length, true), ...entries(loadSensitive)]),
    ];
  }
  if (pinned.length > 0) {
    return [
      mockPinHeadline(pinned.length, runnerName),
      ...entries(pinned),
      ...(loadSensitive.length === 0
        ? []
        : [loadSensitiveText(loadSensitive.length, true), ...entries(loadSensitive)]),
    ];
  }
  return [loadSensitiveText(loadSensitive.length, false), ...entries(loadSensitive)];
}
