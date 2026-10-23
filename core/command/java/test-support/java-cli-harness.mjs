import { tmpdir } from 'node:os';
import { afterEach, beforeEach, expect, vi } from 'vitest';
import { exactText } from '../../../diff/reporting/test-support/output-expectations.mjs';
import {
  fakeGradle,
  fakeGradleRun,
  spawnFakeGradle,
} from '../../../../languages/java/adapters/test-support/in-process-gradle.mjs';
import { runTasksInProcess } from '../../../diff/execution/test-support/in-process-analyzers.mjs';
import { usePresetFixtures } from '../../test-support/preset-fixtures.mjs';
import { readCatalog } from '../../../../languages/java/messages/rule-messages.mjs';
import { exceptionHint } from '../../../../shared/rules/exceptions.mjs';
import { fakeMavenRun, spawnFakeMaven } from './in-process-maven.mjs';
import { linkSentence } from '../../../../shared/messages/test-support/link-sentence.mjs';

export { fakeGradle, fakeGradleRun };

export function runTasksWithFakeGradle(tasks, headPolicyFile, options) {
  return runTasksInProcess(tasks, headPolicyFile, { ...options, spawn: spawnFakeGradle });
}

const GRADLE_TEMPLATE_FILES = {
  'nitpicker.config.json': '{ "preset": "java" }\n',
  'build.gradle': "plugins { id 'java' }\n",
  'src/main/java/demo/A.java': 'package demo;\n\npublic final class A {}\n',
  'violations.txt': 'Avoid unused field: legacy\n',
};

const MAVEN_TEMPLATE_FILES = {
  'nitpicker.config.json': '{ "preset": "java" }\n',
  'pom.xml':
    '<project><modelVersion>4.0.0</modelVersion><groupId>demo</groupId><artifactId>demo</artifactId>' +
    '<version>1</version><build><finalName>demo</finalName></build></project>\n',
  'src/main/java/demo/A.java': 'package demo;\n\npublic final class A {}\n',
  'violations.txt': 'Avoid unused field: legacy\n',
};

export function kotlinConfig(formatter) {
  return `${JSON.stringify({ preset: 'kotlin', ...(formatter && { kotlin: { formatter } }) })}\n`;
}

export function useGradleFixtures(runNitpickerCli) {
  beforeEach(() => {
    vi.stubEnv('NITPICKER_GRADLE', fakeGradle);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });
  const fixtures = usePresetFixtures({
    runCli: runNitpickerCli,
    name: 'java',
    templateFiles: GRADLE_TEMPLATE_FILES,
    runOptions: { runTasks: runTasksWithFakeGradle },
  });

  return {
    temporaryRoot: fixtures.temporaryRoot,
    gradleRepository: (files = {}) => fixtures.repository(files),
    kotlinRepository: (files = {}) =>
      fixtures.repository({
        'nitpicker.config.json': kotlinConfig(),
        'detekt.txt': 'Legacy magic number\n',
        ...files,
      }),
    run: fixtures.run,
    runCli: fixtures.runCli,
    repository: (files = {}) => fixtures.repository(files),
    build: {
      failure: {
        files: { GRADLE_FAIL: 'Execution failed for task :compileJava\n' },
        error: {
          rule: 'gradle-failure',
          message: (snapshot) =>
            gradleFailureMessage(
              `Java preset failed in ${snapshot}: Execution failed for task :compileJava`,
            ),
        },
      },
      missingBinary: {
        stub: (binary) => vi.stubEnv('NITPICKER_GRADLE', binary),
        rule: 'gradle-failure',
        message: (binary) =>
          expect.stringMatching(
            exactText`Full Gradle log: ${tmpdir()}/nitpicker-gradle-failure-${/[A-Za-z0-9]{6}/}/gradle.log\n${binary} was not found. Add the Gradle wrapper (gradlew) to the project, put gradle on the PATH, or set NITPICKER_GRADLE. ${linkSentence('buildToolNotFound')}`,
          ),
      },
    },
  };
}

function runTasksWithFakeMaven(tasks, headPolicyFile, options) {
  return runTasksInProcess(tasks, headPolicyFile, { ...options, spawn: spawnFakeMaven });
}

export function useMavenFixtures(runNitpickerCli) {
  const fixtures = usePresetFixtures({
    runCli: runNitpickerCli,
    name: 'java',
    templateFiles: MAVEN_TEMPLATE_FILES,
    runOptions: { runTasks: runTasksWithFakeMaven },
  });
  beforeEach(() => {
    vi.stubEnv('NITPICKER_MAVEN', fakeMavenRun.maven);
    vi.stubEnv('XDG_CACHE_HOME', fixtures.temporaryRoot('nitpicker-fake-cache-'));
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });
  return {
    temporaryRoot: fixtures.temporaryRoot,
    run: fixtures.run,
    runCli: fixtures.runCli,
    repository: (files = {}) => fixtures.repository(files),
    build: {
      failure: {
        files: { MAVEN_FAIL: 'COMPILATION ERROR in A.java\n' },
        error: {
          rule: 'maven-failure',
          message: (snapshot) =>
            `Maven failed in ${snapshot}:\n[ERROR] COMPILATION ERROR in A.java\n${linkSentence('mavenFails')}`,
        },
      },
      missingBinary: {
        stub: (binary) => vi.stubEnv('NITPICKER_MAVEN', binary),
        rule: 'maven-failure',
        message: (binary) =>
          `${binary} was not found. Add the Maven wrapper (mvnw) to the project, put mvn on the PATH, or set NITPICKER_MAVEN. ${linkSentence('buildToolNotFound')}`,
      },
    },
  };
}

export function unusedFieldMessage(name, file = 'src/main/java/demo/A.java') {
  const { fix } = readCatalog('pmd').UnusedPrivateField;
  return `Avoid unused field: ${name}. ${fix} ${exceptionHint('pmd/UnusedPrivateField', file)}`;
}

export function gradleFailureMessage(detail) {
  const suffix = /[A-Za-z0-9]{6}/;
  return expect.stringMatching(exactText`Full Gradle log: ${tmpdir()}/nitpicker-gradle-failure-${suffix}/gradle.log
${detail}
${linkSentence('gradleFails')}`);
}
