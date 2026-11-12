import { explainedError } from '../../../../../shared/messages/troubleshooting.mjs';

const MINUTE_MS = 60_000;

export function gradleSpawnFailure(error, { command, budget, projectRoot }) {
  if (error.code === 'ETIMEDOUT') {
    return explainedError(
      `Gradle did not finish in ${projectRoot} within ${String(budget.commandTimeoutMs / MINUTE_MS)} minutes and was stopped. ` +
        'Set NITPICKER_GRADLE_TIMEOUT_MINUTES to give each Gradle command more time',
      { cause: error },
    );
  }
  if (error.code === 'ENOENT') {
    return explainedError(
      `${command} was not found. Add the Gradle wrapper (gradlew) to the project, put gradle on the PATH, or set NITPICKER_GRADLE`,
      { cause: error },
    );
  }
  return error;
}
