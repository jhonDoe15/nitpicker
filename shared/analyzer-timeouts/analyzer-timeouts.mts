import { configError, isPlainObject } from '../config.mts';
import { explainedError } from '../messages/troubleshooting.mts';
import { byText } from '../text-order/by-text.mts';
import { fieldsOf } from '../values/readers.mts';

type Environment = Readonly<Record<string, string | undefined>>;
type Timed<Analyzer> = Analyzer & { timeoutMs?: number; configuredTimeout?: true };

export const ANALYZER_TIMEOUT_KEY = 'analyzerTimeoutMinutes';
export const ANALYZER_TIMEOUT_VARIABLE = 'NITPICKER_ANALYZER_TIMEOUT_MS';
export const SIZE_ALLOWANCE_VARIABLE = 'NITPICKER_ANALYZER_SIZE_ALLOWANCE_MS';
export const MINUTE_MS = 60_000;
export const MAX_TIMER_MS = 2 ** 31 - 1;
const MAX_ANALYZER_TIMEOUT_MINUTES = Math.floor(MAX_TIMER_MS / MINUTE_MS);
const WHOLE_NUMBER = /^[1-9]\d*$/u;

export function validateAnalyzerTimeouts(timeouts: unknown): void {
  if (!isPlainObject(timeouts)) {
    throw configError(`"${ANALYZER_TIMEOUT_KEY}" must be an object`);
  }
  for (const [name, minutes] of Object.entries(timeouts)) {
    if (name.trim() === '') {
      throw configError(`"${ANALYZER_TIMEOUT_KEY}" needs non-empty analyzer names`);
    }
    if (
      typeof minutes !== 'number' ||
      !Number.isSafeInteger(minutes) ||
      minutes < 1 ||
      minutes > MAX_ANALYZER_TIMEOUT_MINUTES
    ) {
      throw configError(
        `"${ANALYZER_TIMEOUT_KEY}.${name}" must be a whole number of minutes from 1 to ${String(MAX_ANALYZER_TIMEOUT_MINUTES)}`,
      );
    }
  }
}

export function analyzerDeadlineMs(environment: Environment): number | undefined {
  const value = environment[ANALYZER_TIMEOUT_VARIABLE];
  return value !== undefined && WHOLE_NUMBER.test(value) ? Number(value) : undefined;
}

export function sizeAllowanceMs(environment: Environment): number {
  const value = environment[SIZE_ALLOWANCE_VARIABLE];
  return value !== undefined && WHOLE_NUMBER.test(value) ? Number(value) : 0;
}

export function minutesSetting(
  environment: Environment,
  variable: string,
  { fallbackMs, maxMinutes }: { readonly fallbackMs: number; readonly maxMinutes: number },
): number {
  const value = environment[variable];
  if (value === undefined) {
    return fallbackMs;
  }
  if (!WHOLE_NUMBER.test(value) || Number(value) > maxMinutes) {
    throw explainedError(
      `${variable} must be a whole number from 1 to ${String(maxMinutes)} (minutes)`,
    );
  }
  return Number(value) * MINUTE_MS;
}

export function withConfiguredTimeout<Analyzer extends { readonly name: string }>(
  analyzer: Analyzer,
  timeouts: unknown = {},
): Timed<Analyzer> {
  const minutes = fieldsOf(timeouts)[analyzer.name];
  return minutes === undefined
    ? analyzer
    : { ...analyzer, timeoutMs: Number(minutes) * MINUTE_MS, configuredTimeout: true };
}

export function applyAnalyzerTimeouts<Analyzer extends { readonly name: string }>(
  analyzers: readonly Analyzer[],
  timeouts: unknown,
  knownNames: readonly string[],
): Timed<Analyzer>[] {
  if (timeouts === undefined) {
    return [...analyzers];
  }
  const known = new Set(knownNames);
  const unknown = Object.keys(fieldsOf(timeouts)).filter((name) => !known.has(name));
  if (unknown.length > 0) {
    throw configError(
      `"${ANALYZER_TIMEOUT_KEY}" names unknown analyzers: ${unknown.join(', ')}. Known analyzers: ${[...known].sort(byText).join(', ')}`,
    );
  }
  return analyzers.map((analyzer) => withConfiguredTimeout(analyzer, timeouts));
}
