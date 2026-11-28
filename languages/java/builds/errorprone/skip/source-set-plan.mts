import { sourceSetLevels } from '../engine-checks.mts';
import { projectFlags, type ArgumentSet } from '../engine-arguments.mts';
import {
  knownName,
  levelFlag,
  QUIET_AT_SUGGESTION,
  type CheckLevels,
} from '../options/check-levels.mts';
import { excludedFile } from '../options/project-options.mts';
import { lombokOff } from '../options/runner-levels.mts';
import { hasCheckPlugins, lombokUnsuppressed } from './runner-checks.mts';

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
const SHOWN_CHECKS = 5;
const NO_HAND_BACK: ReadonlyMap<string, readonly string[]> = new Map();

function quiet(check: string, levels: CheckLevels): boolean {
  return QUIET_AT_SUGGESTION.includes(check) && levels.get(check) === 'SUGGESTION';
}

function unknownTurnedOn(head: readonly string[]): string[] {
  return projectFlags(head)
    .flatMap((flag) => levelFlag(flag) ?? [])
    .filter(({ check, level }) => level !== 'OFF' && !knownName(check))
    .map(({ check }) => check);
}

/**
 * The checks Error Prone's runner would run on the source set that the engine does not run, with the checks the
 * project turns on under names Error Prone does not know, which a check plugin may own.
 */
export function remainingChecks(
  set: ArgumentSet,
  onEngine: readonly string[],
  found: CheckLevels | undefined = sourceSetLevels(set),
): string[] {
  const levels: CheckLevels = found ?? new Map();
  const enabled = [...levels.keys()].filter((check) => !quiet(check, levels));
  return [...new Set([...enabled, ...unknownTurnedOn(set.head)])]
    .filter((check) => !onEngine.includes(check))
    .toSorted();
}

type PlanContext = {
  readonly remaining: readonly string[];
  readonly wanted: ReadonlySet<string>;
  readonly mayReport: ReadonlyMap<string, readonly string[]>;
  readonly handedBack: ReadonlyMap<string, readonly string[]>;
  readonly unsuppressed: ReadonlySet<string>;
  readonly lombokOff: readonly string[];
};

function fileChecks(file: string, context: PlanContext): string[] {
  const answer = context.mayReport.get(file);
  const asked =
    answer === undefined ? context.remaining : answer.filter((check) => context.wanted.has(check));
  return [...new Set([...asked, ...(context.handedBack.get(file) ?? [])])].filter(
    (check) => !(context.unsuppressed.has(file) && context.lombokOff.includes(check)),
  );
}

/**
 * The plan from the engine's answer: for each file, the checks of `remaining` that may report there, all of them for a
 * file the engine did not answer for, and the engine's checks handed back to Error Prone there. A file under a
 * `lombok.config` that turns off `@SuppressWarnings` gets the runner's Lombok checks off as well, files the project
 * excludes are left out, and every other file is compiled when the processor path brings checks.
 */
export type EngineAnswer = {
  readonly mayReport: ReadonlyMap<string, readonly string[]>;
  readonly handedBack?: ReadonlyMap<string, readonly string[]>;
};

export function sourceSetPlan(
  set: ArgumentSet,
  remaining: readonly string[],
  { mayReport, handedBack = NO_HAND_BACK }: EngineAnswer,
): SourceSetPlan {
  const context = {
    remaining,
    wanted: new Set(remaining),
    mayReport,
    handedBack,
    unsuppressed: lombokUnsuppressed(set.sources),
    lombokOff: lombokOff(set.head, true),
  };
  const excluded = excludedFile(set.head);
  const plugins = hasCheckPlugins(set.head);
  const files = set.sources.filter(
    (file) => !excluded(file) && (plugins || fileChecks(file, context).length > 0),
  );
  if (files.length === 0) {
    return { kind: 'none' };
  }
  const checks = [...new Set(files.flatMap((file) => fileChecks(file, context)))].toSorted();
  return { kind: 'narrowed', files, checks };
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
  const shown = plan.checks.slice(0, SHOWN_CHECKS).join(', ');
  const hidden = plan.checks.length - SHOWN_CHECKS;
  const more = hidden > 0 ? ` and ${String(hidden)} more` : '';
  return (
    `nitpicker: Error Prone compiles ${String(plan.files.length)} of ${String(set.sources.length)} files of ` +
    `${name} for ${String(plan.checks.length)} checks the engine does not run: ${shown}${more}\n`
  );
}
