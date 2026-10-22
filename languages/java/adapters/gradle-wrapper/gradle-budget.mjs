const MINUTE_MS = 60_000;
const DEFAULT_MINUTES = 15;
const MAX_GRADLE_STAGES = 2;
const REPORT_OVERHEAD_MS = MINUTE_MS;
const MAX_TIMER_MS = 2 ** 31 - 1;
const MAX_MINUTES = Math.floor(
  (MAX_TIMER_MS - REPORT_OVERHEAD_MS) / (MAX_GRADLE_STAGES * MINUTE_MS),
);

export function gradleBudget(environment = {}) {
  const value = environment.NITPICKER_GRADLE_TIMEOUT_MINUTES;
  const minutes = value === undefined ? DEFAULT_MINUTES : Number(value);
  if (
    (value !== undefined && !/^[1-9]\d*$/u.test(value)) ||
    !Number.isInteger(minutes) ||
    minutes > MAX_MINUTES
  ) {
    throw new Error(
      `NITPICKER_GRADLE_TIMEOUT_MINUTES must be a whole number from 1 to ${String(MAX_MINUTES)} (minutes)`,
    );
  }
  const commandTimeoutMs = minutes * MINUTE_MS;
  return {
    minutes,
    commandTimeoutMs,
    analyzerTimeoutMs: MAX_GRADLE_STAGES * commandTimeoutMs + REPORT_OVERHEAD_MS,
  };
}
