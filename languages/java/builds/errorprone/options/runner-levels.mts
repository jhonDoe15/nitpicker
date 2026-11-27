import CHECKS from '../../../gradle/errorprone/checks.json' with { type: 'json' };
import { ownClasses, ownPackages, projectFlags } from '../engine-arguments.mts';
import { ALL_ERRORS_AS_WARNINGS, checkLevels, type CheckLevels } from './check-levels.mts';

export type RunnerGroup = {
  readonly lombokUnsuppressed: boolean;
  readonly immutableInReach: boolean;
};

const NULL_AWAY = 'NullAway';
const FIX_CHECKS = '-XepNitpickerFixChecks:';
const TEST_ONLY = '--test-only';

function nullAwayOn(head: readonly string[]): boolean {
  return !head.includes(TEST_ONLY) && ownPackages(ownClasses(head)).length > 0;
}

function runnerFlags(head: readonly string[], group: RunnerGroup): string[] {
  return [
    ALL_ERRORS_AS_WARNINGS,
    ...(group.immutableInReach ? [] : ['-Xep:Immutable:OFF']),
    ...CHECKS.enable.map((check) => `-Xep:${check}:WARN`),
    ...CHECKS.disable.map((check) => `-Xep:${check}:OFF`),
    ...(group.lombokUnsuppressed
      ? CHECKS.lombokUnsuppressedOff.map((check) => `-Xep:${check}:OFF`)
      : []),
    `-Xep:${NULL_AWAY}:${nullAwayOn(head) ? 'WARN' : 'OFF'}`,
    ...projectFlags(head).filter((flag) => !flag.startsWith(FIX_CHECKS)),
  ];
}

/** The checks the runner's Error Prone runs on a group of files and their severities, undefined if it refuses. */
export function runnerLevels(
  head: readonly string[],
  group: RunnerGroup,
  extra: readonly string[] = [],
): CheckLevels | undefined {
  return checkLevels([...runnerFlags(head, group), ...extra]);
}

/** The checks the runner turns off in the files under a `lombok.config` that turns off `@SuppressWarnings`. */
export function lombokOff(head: readonly string[], immutableInReach: boolean): string[] {
  const plain = runnerLevels(head, { lombokUnsuppressed: false, immutableInReach });
  const lombok = runnerLevels(head, { lombokUnsuppressed: true, immutableInReach });
  return [...(plain?.keys() ?? [])].filter((check) => lombok?.has(check) !== true);
}
