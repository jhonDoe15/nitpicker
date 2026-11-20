import {
  MAX_TIMER_MS,
  MINUTE_MS,
  minutesSetting as untypedMinutesSetting,
  analyzerDeadlineMs as untypedAnalyzerDeadlineMs,
  sizeAllowanceMs as untypedSizeAllowanceMs,
} from '../../../../shared/analyzer-timeouts/analyzer-timeouts.mjs';
import type { JavaEnvironment } from '../typed/java-values.mts';
import type { TimeBudget } from '../typed/java-run-options.mts';

const minutesSetting: (
  environment: JavaEnvironment,
  variable: string,
  options: { fallbackMs: number; maxMinutes: number },
) => number = untypedMinutesSetting;
const analyzerDeadlineMs: (environment: JavaEnvironment) => number | undefined =
  untypedAnalyzerDeadlineMs;

const sizeAllowanceMs: (environment: JavaEnvironment) => number = untypedSizeAllowanceMs;

const DEFAULT_COMMAND_MS = 15 * MINUTE_MS;
const MAX_BUILD_STAGES = 2;
export const REPORT_OVERHEAD_MS = MINUTE_MS;
const SOURCE_EXTENSIONS = ['java', 'kt'];
const MODULE_FILES = ['build.gradle', 'build.gradle.kts', 'pom.xml'];
export const BUILD_TIMEOUT_SCALE = {
  perThousandFilesMs: MAX_BUILD_STAGES * 2 * MINUTE_MS,
  extensions: SOURCE_EXTENSIONS,
  perModuleMs: MAX_BUILD_STAGES * (MINUTE_MS / 2),
  moduleFiles: MODULE_FILES,
};
const MAX_MINUTES = Math.floor(
  (MAX_TIMER_MS - REPORT_OVERHEAD_MS) / (MAX_BUILD_STAGES * MINUTE_MS),
);

function buildBudget(environment: JavaEnvironment, variable: string): TimeBudget {
  const commandMs = minutesSetting(environment, variable, {
    fallbackMs:
      analyzerDeadlineMs(environment) ??
      Math.min(
        DEFAULT_COMMAND_MS + Math.floor(sizeAllowanceMs(environment) / MAX_BUILD_STAGES),
        MAX_MINUTES * MINUTE_MS,
      ),
    maxMinutes: MAX_MINUTES,
  });
  return {
    commandTimeoutMs: commandMs,
    analyzerTimeoutMs: Math.min(MAX_BUILD_STAGES * commandMs + REPORT_OVERHEAD_MS, MAX_TIMER_MS),
  };
}

export function gradleBudget(environment: JavaEnvironment = process.env): TimeBudget {
  return buildBudget(environment, 'NITPICKER_GRADLE_TIMEOUT_MINUTES');
}

export function mavenBudget(environment: JavaEnvironment = process.env): TimeBudget {
  return buildBudget(environment, 'NITPICKER_MAVEN_TIMEOUT_MINUTES');
}
