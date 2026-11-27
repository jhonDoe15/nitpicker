import PORTED_CHECKS from '../../gradle/errorprone/engine-checks.json' with { type: 'json' };
import { ownClasses, ownPackages, runsProcessors, type ArgumentSet } from './engine-arguments.mts';
import { NOT_DISABLEABLE, type CheckLevels } from './options/check-levels.mts';
import { optionReaders, unsupportedOption } from './options/project-options.mts';
import { runnerLevels } from './options/runner-levels.mts';
import { immutableInReach } from './skip/runner-checks.mts';

export const NULL_AWAY = 'NullAway';
export const ENGINE_CHECKS: readonly string[] = [...PORTED_CHECKS, NULL_AWAY];

export type EngineChecks = {
  readonly checks: readonly string[];
  readonly packages: readonly string[];
};

const NONE: EngineChecks = { checks: [], packages: [] };
const TEST_ONLY = '--test-only';

export function testOnly(head: readonly string[]): boolean {
  return head.includes(TEST_ONLY);
}

/** The checks Error Prone's runner runs on the source set outside Lombok groups, undefined if it refuses its flags. */
export function sourceSetLevels(set: ArgumentSet): CheckLevels | undefined {
  return runnerLevels(set.head, {
    lombokUnsuppressed: false,
    immutableInReach: immutableInReach(set.head, set.sources),
  });
}

/** Why the source set stays whole on Error Prone and the engine runs none of its checks there, if it does. */
export function wholeReason(
  set: ArgumentSet,
  levels: CheckLevels | undefined = sourceSetLevels(set),
): string | undefined {
  const unsupported = unsupportedOption(set.head);
  if (unsupported !== undefined) {
    return `the project sets the Error Prone option ${unsupported}`;
  }
  if (levels === undefined) {
    return 'Error Prone refuses the project check levels';
  }
  return runsProcessors(set.head) ? 'it runs annotation processors' : undefined;
}

function runsOnEngine(check: string, levels: CheckLevels): boolean {
  const level = levels.get(check);
  return level !== undefined && (level !== 'ERROR' || NOT_DISABLEABLE.has(check));
}

/**
 * The engine's checks that Error Prone's runner would run on the source set at warning level and without a project
 * option they read; NullAway only on main sources with own packages.
 */
export function engineChecksFor(
  set: ArgumentSet,
  levels: CheckLevels | undefined = sourceSetLevels(set),
): EngineChecks {
  if (levels === undefined || wholeReason(set, levels) !== undefined) {
    return NONE;
  }
  const readers = optionReaders(set.head);
  const packages = testOnly(set.head) ? [] : ownPackages(ownClasses(set.head));
  const checks = ENGINE_CHECKS.filter(
    (check) =>
      runsOnEngine(check, levels) &&
      !readers.has(check) &&
      (check !== NULL_AWAY || packages.length > 0),
  );
  return { checks, packages: checks.includes(NULL_AWAY) ? packages : [] };
}
