import { describe, expect, it } from 'vitest';
import {
  TROUBLESHOOTING_ANCHORS,
  troubleshootingSentence,
} from '../../../../../shared/messages/troubleshooting.mjs';
import { gradleSpawnFailure } from './spawn-failure.mjs';

const budget = { minutes: 15 };

describe('gradleSpawnFailure', () => {
  it('explains a timeout, names the setting that raises it and links the entry', () => {
    const cause = Object.assign(new Error('spawnSync ./gradlew ETIMEDOUT'), { code: 'ETIMEDOUT' });

    const error = gradleSpawnFailure(cause, { command: './gradlew', budget });

    expect(error.message).toBe(
      'Gradle did not finish within 15 minutes and was stopped. ' +
        `Set NITPICKER_GRADLE_TIMEOUT_MINUTES to allow more time. ${troubleshootingSentence(TROUBLESHOOTING_ANCHORS.buildTimeout)}`,
    );
    expect(error.cause).toBe(cause);
  });

  it('names the three ways to provide Gradle when the command is not found', () => {
    const cause = Object.assign(new Error('spawnSync gradle ENOENT'), { code: 'ENOENT' });

    const error = gradleSpawnFailure(cause, { command: 'gradle', budget });

    expect(error.message).toBe(
      'gradle was not found. Add the Gradle wrapper (gradlew) to the project, ' +
        `put gradle on the PATH, or set NITPICKER_GRADLE. ${troubleshootingSentence(TROUBLESHOOTING_ANCHORS.buildToolNotFound)}`,
    );
    expect(error.cause).toBe(cause);
  });

  it('returns any other error as it is', () => {
    const cause = Object.assign(new Error('spawn EACCES'), { code: 'EACCES' });

    expect(gradleSpawnFailure(cause, { command: 'gradle', budget })).toBe(cause);
  });
});
