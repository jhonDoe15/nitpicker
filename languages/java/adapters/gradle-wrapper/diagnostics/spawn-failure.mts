import { explainedError } from '../../../../../shared/messages/troubleshooting.mjs';
import { fieldOf } from '../../../../../shared/values/readers.mts';
import type { JavaBudget } from '../../typed/java-run-options.mts';

type SpawnContext = {
  readonly command: string;
  readonly budget: JavaBudget;
  readonly projectRoot: string;
};

const MINUTE_MS = 60_000;

export function gradleSpawnFailure(
  error: unknown,
  { command, budget, projectRoot }: SpawnContext,
): Error {
  const code = fieldOf(error, 'code');
  if (code === 'ETIMEDOUT') {
    return explainedError(
      `Gradle did not finish in ${projectRoot} within ${String((budget.commandTimeoutMs ?? 0) / MINUTE_MS)} minutes and was stopped. ` +
        'Set NITPICKER_GRADLE_TIMEOUT_MINUTES to give each Gradle command more time',
      { cause: error },
    );
  }
  if (code === 'ENOENT') {
    return explainedError(
      `${command} was not found. Add the Gradle wrapper (gradlew) to the project, put gradle on the PATH, or set NITPICKER_GRADLE`,
      { cause: error },
    );
  }
  return error instanceof Error ? error : new Error(String(error));
}
