import { configError, isPlainObject } from '../config.mjs';

export const ANALYZER_TIMEOUT_KEY = 'analyzerTimeoutMinutes';
export const ANALYZER_TIMEOUT_VARIABLE = 'NITPICKER_ANALYZER_TIMEOUT_MS';
export const MINUTE_MS = 60_000;
export const MAX_TIMER_MS = 2 ** 31 - 1;
const MAX_ANALYZER_TIMEOUT_MINUTES = Math.floor(MAX_TIMER_MS / MINUTE_MS);
const WHOLE_NUMBER = /^[1-9]\d*$/u;

export function validateAnalyzerTimeouts(timeouts) {
  if (!isPlainObject(timeouts)) {
    throw configError(`"${ANALYZER_TIMEOUT_KEY}" must be an object`);
  }
  for (const [name, minutes] of Object.entries(timeouts)) {
    if (name.trim() === '') {
      throw configError(`"${ANALYZER_TIMEOUT_KEY}" needs non-empty analyzer names`);
    }
    if (!Number.isSafeInteger(minutes) || minutes < 1 || minutes > MAX_ANALYZER_TIMEOUT_MINUTES) {
      throw configError(
        `"${ANALYZER_TIMEOUT_KEY}.${name}" must be a whole number of minutes from 1 to ${String(MAX_ANALYZER_TIMEOUT_MINUTES)}`,
      );
    }
  }
}

export function analyzerDeadlineMs(environment) {
  const value = environment[ANALYZER_TIMEOUT_VARIABLE];
  return value !== undefined && WHOLE_NUMBER.test(value) ? Number(value) : undefined;
}

export function minutesSetting(environment, variable, { fallbackMs, maxMinutes }) {
  const value = environment[variable];
  if (value === undefined) {
    return fallbackMs;
  }
  if (!WHOLE_NUMBER.test(value) || Number(value) > maxMinutes) {
    throw new Error(`${variable} must be a whole number from 1 to ${String(maxMinutes)} (minutes)`);
  }
  return Number(value) * MINUTE_MS;
}

export function withConfiguredTimeout(analyzer, timeouts = {}) {
  return timeouts[analyzer.name] === undefined
    ? analyzer
    : { ...analyzer, timeoutMs: timeouts[analyzer.name] * MINUTE_MS, configuredTimeout: true };
}

export function applyAnalyzerTimeouts(analyzers, timeouts, knownNames) {
  if (timeouts === undefined) {
    return analyzers;
  }
  const known = new Set(knownNames);
  const unknown = Object.keys(timeouts).filter((name) => !known.has(name));
  if (unknown.length > 0) {
    throw configError(
      `"${ANALYZER_TIMEOUT_KEY}" names unknown analyzers: ${unknown.join(', ')}. Known analyzers: ${[...known].sort().join(', ')}`,
    );
  }
  return analyzers.map((analyzer) => withConfiguredTimeout(analyzer, timeouts));
}
