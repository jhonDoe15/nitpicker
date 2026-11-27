import { knownName, NOT_DISABLEABLE, type CheckLevels, type Severity } from './check-levels.mts';
import { lombokOff, runnerLevels, type RunnerGroup } from './runner-levels.mts';

const LEVEL_NAMES: Readonly<Record<Severity, string>> = {
  ERROR: 'ERROR',
  WARNING: 'WARN',
  SUGGESTION: 'DEFAULT',
};
const FIX_ROUNDS = 3;
const PLAIN: RunnerGroup = { lombokUnsuppressed: false, immutableInReach: true };
const LOMBOK: RunnerGroup = { lombokUnsuppressed: true, immutableInReach: true };

function fixes(now: CheckLevels, kept: ReadonlySet<string>, wanted: CheckLevels): string[] {
  const levels = [...kept].flatMap((check) => {
    const level = wanted.get(check);
    return level === undefined || now.get(check) === level
      ? []
      : [`-Xep:${check}:${LEVEL_NAMES[level]}`];
  });
  const off = [...now.keys()]
    .filter((check) => !(kept.has(check) || NOT_DISABLEABLE.has(check)))
    .map((check) => `-Xep:${check}:OFF`);
  return [...levels, ...off];
}

function lombokKeeps(
  head: readonly string[],
  flags: readonly string[],
  kept: ReadonlySet<string>,
): boolean {
  const now = runnerLevels(head, LOMBOK, flags);
  const off = lombokOff(head, true);
  return (
    now !== undefined &&
    [...now.keys()].every((check) => kept.has(check) || NOT_DISABLEABLE.has(check)) &&
    [...kept].every((check) => now.has(check) || off.includes(check) || !knownName(check))
  );
}

type Narrowing = {
  readonly head: readonly string[];
  readonly kept: ReadonlySet<string>;
  readonly wanted: CheckLevels;
};

function nextFlags(
  { head, kept, wanted }: Narrowing,
  flags: readonly string[],
): string[] | undefined {
  const now = runnerLevels(head, PLAIN, flags);
  const more = now === undefined ? undefined : fixes(now, kept, wanted);
  return more !== undefined && more.length === 0 && lombokKeeps(head, flags, kept)
    ? undefined
    : [...flags, ...(more ?? [])];
}

/**
 * The level flags that make a narrowed Error Prone run keep only the planned checks, each at the level the whole run
 * gives it. Turning a check off by name also turns off the checks that carry that name, so the flags are checked
 * against Error Prone's option rules and fixed until they settle.
 */
export function narrowedFlags(
  head: readonly string[],
  checks: readonly string[],
  wanted: CheckLevels,
): string[] {
  const narrowing = { head, kept: new Set(checks), wanted };
  const attempts: string[][] = [[]];
  for (const flags of attempts) {
    const next = nextFlags(narrowing, flags);
    if (next === undefined) {
      return flags;
    }
    if (attempts.length <= FIX_ROUNDS) {
      attempts.push(next);
    }
  }
  throw new Error('a narrowed Error Prone run cannot keep only the planned checks');
}
