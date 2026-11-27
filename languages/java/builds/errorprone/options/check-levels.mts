import CHECKS from '../../../gradle/errorprone/checks.json' with { type: 'json' };
import FACTS from '../../../gradle/errorprone/option-facts.json' with { type: 'json' };

export type Severity = 'ERROR' | 'WARNING' | 'SUGGESTION';
export type CheckLevels = ReadonlyMap<string, Severity>;
type Override = 'OFF' | 'WARN' | 'ERROR' | 'DEFAULT';
type Parsed = {
  readonly overrides: Map<string, Override>;
  readonly global: Set<string>;
};

export const ALL_ERRORS_AS_WARNINGS = '-XepAllErrorsAsWarnings';
const SUGGESTIONS_AS_WARNINGS = '-XepAllSuggestionsAsWarnings';
const ENABLE_ALL = '-XepAllDisabledChecksAsWarnings';
const DISABLE_ALL = '-XepDisableAllChecks';
const DISABLE_WARNINGS = '-XepDisableAllWarnings';
export const GLOBAL_FLAGS: readonly string[] = [
  ALL_ERRORS_AS_WARNINGS,
  SUGGESTIONS_AS_WARNINGS,
  ENABLE_ALL,
  DISABLE_ALL,
  DISABLE_WARNINGS,
];
const LEVEL_FLAG = /^-Xep:([^:]+)(?::(OFF|WARN|ERROR|DEFAULT))?$/u;
const ERRORS: ReadonlySet<string> = new Set(FACTS.errorChecks);
const SUGGESTIONS: ReadonlySet<string> = new Set(FACTS.suggestionChecks);
export const NOT_DISABLEABLE: ReadonlySet<string> = new Set(FACTS.notDisableable);
/** NullAway's companion checks, which report nothing at their default suggestion level. */
export const QUIET_AT_SUGGESTION: readonly string[] = FACTS.pluginChecks.filter(
  (check) => check !== 'NullAway',
);
const ALL: readonly string[] = [...CHECKS.reviewedChecks, ...FACTS.pluginChecks];
const OFF_BY_DEFAULT: readonly string[] = [...CHECKS.defaultOff, ...CHECKS.enable];
const ALTERNATIVES: Readonly<Record<string, readonly string[]>> = FACTS.alternativeNames;
const NAMES = new Map<string, readonly string[]>(
  [...new Set([...ALL, ...Object.keys(ALTERNATIVES)])].map((name) => [
    name,
    [...(ALL.includes(name) ? [name] : []), ...(ALTERNATIVES[name] ?? [])],
  ]),
);

/** Whether Error Prone 2.50.0 or NullAway knows a check by this name. */
export function knownName(name: string): boolean {
  return NAMES.has(name);
}

export function levelFlag(
  flag: string,
): { readonly check: string; readonly level: Override } | undefined {
  const [, check, level] = LEVEL_FLAG.exec(flag) ?? [];
  return check === undefined ? undefined : { check, level: (level ?? 'DEFAULT') as Override };
}

export function defaultSeverity(check: string): Severity {
  if (ERRORS.has(check)) {
    return 'ERROR';
  }
  return SUGGESTIONS.has(check) ? 'SUGGESTION' : 'WARNING';
}

function rewrite(overrides: Map<string, Override>, from: Override, to: Override): void {
  for (const [check, level] of overrides) {
    if (level === from) {
      overrides.set(check, to);
    }
  }
}

const REWRITES: ReadonlyMap<string, readonly [Override, Override]> = new Map([
  [ALL_ERRORS_AS_WARNINGS, ['ERROR', 'WARN']],
  [ENABLE_ALL, ['OFF', 'WARN']],
  [DISABLE_WARNINGS, ['WARN', 'OFF']],
]);

function parsed(flags: readonly string[]): Parsed {
  const overrides = new Map<string, Override>();
  const global = new Set<string>();
  for (const flag of flags) {
    const level = levelFlag(flag);
    const rewritten = REWRITES.get(flag);
    if (level !== undefined) {
      overrides.set(level.check, level.level);
    } else if (rewritten !== undefined) {
      rewrite(overrides, ...rewritten);
    } else if (flag === DISABLE_ALL) {
      overrides.clear();
    }
    if (GLOBAL_FLAGS.includes(flag)) {
      global.add(flag);
    }
  }
  return { overrides, global };
}

type State = {
  readonly severities: Map<string, Severity>;
  readonly disabled: Set<string>;
};

function globalState(global: ReadonlySet<string>): State {
  const severities = new Map(ALL.map((check) => [check, defaultSeverity(check)]));
  const disabled = new Set(OFF_BY_DEFAULT);
  if (global.has(ENABLE_ALL)) {
    disabled.forEach((check) => severities.set(check, 'WARNING'));
    disabled.clear();
  }
  for (const check of ALL) {
    const original = defaultSeverity(check);
    const dropped = global.has(ALL_ERRORS_AS_WARNINGS) && original === 'ERROR';
    const raised = global.has(SUGGESTIONS_AS_WARNINGS) && original === 'SUGGESTION';
    if ((dropped && !NOT_DISABLEABLE.has(check)) || raised) {
      severities.set(check, 'WARNING');
    }
    const offAsWarning = global.has(DISABLE_WARNINGS) && original === 'WARNING';
    if (offAsWarning || (global.has(DISABLE_ALL) && !NOT_DISABLEABLE.has(check))) {
      disabled.add(check);
    }
  }
  return { severities, disabled };
}

function applied({ severities, disabled }: State, check: string, level: Override): boolean {
  if (level === 'OFF') {
    severities.delete(check);
    disabled.add(check);
    return !NOT_DISABLEABLE.has(check);
  }
  const demoted = level === 'WARN' && NOT_DISABLEABLE.has(check) && !OFF_BY_DEFAULT.includes(check);
  const severity = { WARN: 'WARNING', ERROR: 'ERROR', DEFAULT: defaultSeverity(check) }[level];
  severities.set(check, severity as Severity);
  disabled.delete(check);
  return !(demoted && defaultSeverity(check) === 'ERROR');
}

/**
 * The checks Error Prone 2.50.0 runs for this list of plugin flags and the severity of each, as its option parser and
 * scanner apply them: global flags rewrite the levels named before them, `-XepDisableAllChecks` forgets those levels,
 * and a level names every check that carries that name. Undefined when Error Prone refuses the list.
 */
export function checkLevels(flags: readonly string[]): CheckLevels | undefined {
  const { overrides, global } = parsed(flags);
  const state = globalState(global);
  for (const [name, level] of overrides) {
    for (const check of NAMES.get(name) ?? []) {
      if (!applied(state, check, level)) {
        return undefined;
      }
    }
  }
  return new Map(
    ALL.filter((check) => !state.disabled.has(check)).map((check) => [
      check,
      state.severities.get(check) ?? defaultSeverity(check),
    ]),
  );
}
