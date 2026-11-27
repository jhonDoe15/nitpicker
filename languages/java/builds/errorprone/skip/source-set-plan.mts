import { NULL_AWAY } from '../engine-checks.mts';
import { ownClasses, ownPackages, type ArgumentSet } from '../engine-arguments.mts';
import {
  CANNOT_BE_OFF,
  ENABLED_CHECKS,
  IMMUTABLE,
  immutableInReach,
  LOMBOK_UNSUPPRESSED_OFF,
  lombokUnsuppressed,
  projectLevels,
} from './runner-checks.mts';

/**
 * What Error Prone still does for a source set once the engine has run its checks: nothing, or a run of only the
 * checks and files where a check the engine lacks may report.
 */
export type SourceSetPlan =
  | { readonly kind: 'none' }
  | {
      readonly kind: 'narrowed';
      readonly files: readonly string[];
      readonly checks: readonly string[];
    };

export const NARROWED = '--narrowed';
const TEST_ONLY = '--test-only';

/** The checks Error Prone's runner would run on the source set that the engine does not run. */
export function remainingChecks(set: ArgumentSet, onEngine: readonly string[]): string[] {
  const { on, off } = projectLevels(set.head);
  const nullAway =
    !set.head.includes(TEST_ONLY) && ownPackages(ownClasses(set.head)).length > 0
      ? [NULL_AWAY]
      : [];
  const immutable = immutableInReach(set.head, set.sources);
  const enabled = [...ENABLED_CHECKS, ...nullAway, ...on].filter(
    (check) => !off.has(check) && (check !== IMMUTABLE || immutable || on.has(IMMUTABLE)),
  );
  return [...new Set(enabled)].filter((check) => !onEngine.includes(check)).toSorted();
}

/**
 * The plan from the engine's answer: for each file, the checks of `remaining` that may report there, all of them for a
 * file the engine did not answer for. A file under a `lombok.config` that turns off `@SuppressWarnings` gets the
 * runner's Lombok checks off as well.
 */
export function sourceSetPlan(
  set: ArgumentSet,
  remaining: readonly string[],
  mayReport: ReadonlyMap<string, readonly string[]>,
): SourceSetPlan {
  const unsuppressed = lombokUnsuppressed(set.sources);
  const wanted = new Set(remaining);
  const checksOf = (file: string): string[] =>
    (mayReport.get(file) ?? remaining).filter(
      (check) =>
        wanted.has(check) && !(unsuppressed.has(file) && LOMBOK_UNSUPPRESSED_OFF.includes(check)),
    );
  const files = set.sources.filter((file) => checksOf(file).length > 0);
  if (files.length === 0) {
    return { kind: 'none' };
  }
  const checks = [...new Set(files.flatMap(checksOf))].toSorted();
  return { kind: 'narrowed', files, checks };
}

/**
 * The checks a narrowed run turns off: every one the runner may run and the plan does not need, except those Error
 * Prone cannot turn off. Immutable is among them when the runner would not run it on the whole source set.
 */
export function checksOff(
  plan: SourceSetPlan,
  remaining: readonly string[],
  onEngine: readonly string[],
): string[] {
  const kept = plan.kind === 'narrowed' ? plan.checks : [];
  return [...new Set([...ENABLED_CHECKS, NULL_AWAY, ...onEngine, ...remaining])].filter(
    (check) => !kept.includes(check) && !CANNOT_BE_OFF.includes(check),
  );
}

/** The arguments file for the plan: no sources, or the narrowed sources compiled against the build's classes. */
export function plannedArguments(
  set: ArgumentSet,
  plan: SourceSetPlan,
  flags: readonly string[],
): string {
  const head = [...set.head, ...flags.map((flag) => `--errorprone-flag=${flag}`)];
  if (plan.kind === 'none') {
    return [...head, '--sources', ''].join('\n');
  }
  const narrowed = plan.files.length < set.sources.length ? [NARROWED] : [];
  return [...head, ...narrowed, '--sources', ...plan.files, ''].join('\n');
}

/** One line for the log: what Error Prone does for the source set and why. */
export function planLine(name: string, set: ArgumentSet, plan: SourceSetPlan): string {
  if (plan.kind === 'none') {
    return `nitpicker: Error Prone does not compile ${name}: the engine ran every check that can report there\n`;
  }
  const shown = plan.checks.slice(0, 5).join(', ');
  const more = plan.checks.length > 5 ? ` and ${String(plan.checks.length - 5)} more` : '';
  return (
    `nitpicker: Error Prone compiles ${String(plan.files.length)} of ${String(set.sources.length)} files of ` +
    `${name} for ${String(plan.checks.length)} checks the engine does not run: ${shown}${more}\n`
  );
}
