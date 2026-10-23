import {
  TROUBLESHOOTING_ANCHORS,
  troubleshootingError,
} from '../../../../../shared/messages/troubleshooting.mjs';

export function gradleSpawnFailure(error, { command, budget }) {
  if (error.code === 'ETIMEDOUT') {
    return troubleshootingError(
      `Gradle did not finish within ${String(budget.minutes)} minutes and was stopped. Set NITPICKER_GRADLE_TIMEOUT_MINUTES to allow more time`,
      TROUBLESHOOTING_ANCHORS.buildTimeout,
      { cause: error },
    );
  }
  if (error.code === 'ENOENT') {
    return troubleshootingError(
      `${command} was not found. Add the Gradle wrapper (gradlew) to the project, put gradle on the PATH, or set NITPICKER_GRADLE`,
      TROUBLESHOOTING_ANCHORS.buildToolNotFound,
      { cause: error },
    );
  }
  return error;
}
