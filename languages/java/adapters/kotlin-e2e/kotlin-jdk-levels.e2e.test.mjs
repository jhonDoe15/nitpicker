import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { GRADLE_STEP_TIMEOUT_MS } from '../test-support/gradle-e2e.mjs';
import {
  analyzeAtLevel,
  jdkHome,
  removeLevelProjects,
  TESTS_FAILED,
} from '../java-e2e/test-support/jdk-levels-run.mjs';
import { KOTLIN_POLICY, kotlinLevelFiles } from '../java-e2e/test-support/kotlin-levels-data.mjs';

const kotlinEnabled = process.env.NITPICKER_KOTLIN_E2E === '1';
const gradle = process.env.NITPICKER_GRADLE ?? 'gradle';
const gradleOnJdk25 = process.env.NITPICKER_GRADLE_ON_JDK25;

function analyzeKotlin(release, runner) {
  return analyzeAtLevel({
    release,
    files: kotlinLevelFiles(release),
    jdk: runner.jdk,
    build: { gradle: runner.gradle },
    policy: KOTLIN_POLICY,
  });
}

const KOTLIN_EXPECTED = {
  toolErrors: [TESTS_FAILED],
  reported: [
    'crap crap-score-limit Shapes.kt',
    'detekt detekt.style.FunctionOnlyReturningConstant Shapes.kt',
    'jacoco changed-branch-coverage Shapes.kt',
    'jacoco uncovered-method Messy.kt',
    'jacoco uncovered-method Shapes.kt',
    'ktfmt format Messy.kt',
    'ktfmt format Shapes.kt',
    'pit mutant-nocoverage Messy.kt',
    'pit mutant-nocoverage Shapes.kt',
    'structure function-parameters-limit Shapes.kt',
  ],
};

describe.skipIf(!kotlinEnabled)('the Kotlin preset on each supported JDK level', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  afterAll(() => {
    removeLevelProjects();
  });

  for (const release of [17, 25]) {
    it.skipIf(jdkHome(release) === undefined)(
      `runs every analyzer on a Kotlin project at release ${String(release)}`,
      () => {
        expect(analyzeKotlin(release, { gradle, jdk: release === 17 ? 17 : undefined })).toEqual(
          KOTLIN_EXPECTED,
        );
      },
      GRADLE_STEP_TIMEOUT_MS,
    );
  }

  it.skipIf(gradleOnJdk25 === undefined || jdkHome(25) === undefined)(
    'runs detekt on an older JDK when Gradle itself runs on JDK 25',
    () => {
      expect(analyzeKotlin(25, { gradle: gradleOnJdk25, jdk: 25 })).toEqual(KOTLIN_EXPECTED);
    },
    GRADLE_STEP_TIMEOUT_MS,
  );
});
