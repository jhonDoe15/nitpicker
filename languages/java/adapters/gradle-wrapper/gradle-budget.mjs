import {
  MAX_TIMER_MS,
  MINUTE_MS,
  minutesSetting,
  analyzerDeadlineMs,
} from '../../../../shared/analyzer-timeouts/analyzer-timeouts.mjs';

const DEFAULT_COMMAND_MS = 15 * MINUTE_MS;
const MAX_BUILD_STAGES = 2;
const REPORT_OVERHEAD_MS = MINUTE_MS;
const MAX_MINUTES = Math.floor(
  (MAX_TIMER_MS - REPORT_OVERHEAD_MS) / (MAX_BUILD_STAGES * MINUTE_MS),
);

function buildBudget(environment, variable) {
  const commandMs = minutesSetting(environment, variable, {
    fallbackMs: analyzerDeadlineMs(environment) ?? DEFAULT_COMMAND_MS,
    maxMinutes: MAX_MINUTES,
  });
  return {
    commandTimeoutMs: commandMs,
    analyzerTimeoutMs: Math.min(MAX_BUILD_STAGES * commandMs + REPORT_OVERHEAD_MS, MAX_TIMER_MS),
  };
}

export function gradleBudget(environment = {}) {
  return buildBudget(environment, 'NITPICKER_GRADLE_TIMEOUT_MINUTES');
}

export function mavenBudget(environment = {}) {
  return buildBudget(environment, 'NITPICKER_MAVEN_TIMEOUT_MINUTES');
}
