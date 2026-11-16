import { afterEach, beforeEach, vi } from 'vitest';
import type { RunTaskOptions } from '../../../diff/execution/progress.mts';
import { linkSentence } from '../../test-support/report-readers.mts';
import type {
  GradleFixtures,
  MavenFixtures,
  RepositoryFiles,
  RunNitpickerCli,
  UnusedFieldFields,
} from '../../test-support/fixture-types.mts';
import {
  EMPTY_MUTATION_FACTS,
  fakeGradle,
  spawnFakeGradle,
} from '../../../../languages/java/adapters/test-support/in-process-gradle.mts';
import { runTasksInProcess } from '../../../diff/execution/test-support/in-process-analyzers.mts';
import { usePresetFixtures } from '../../test-support/preset-fixtures.mts';
import { readCatalog as readRuleCatalog } from '../../../../languages/java/messages/rule-messages.mjs';
import { exceptionHint as renderExceptionHint } from '../../../../shared/rules/exceptions.mjs';
import { fakeMavenRun, spawnFakeMaven } from './in-process-maven.mts';

export const exceptionHint: (rule: string, file: string) => string = renderExceptionHint;

const readCatalog: (tool: string) => { readonly UnusedPrivateField: { readonly fix: string } } =
  readRuleCatalog;

export type { GradleFixtures, MavenFixtures } from '../../test-support/fixture-types.mts';
export { fakeGradle };

export function runTasksWithFakeGradle(
  tasks: readonly object[],
  headPolicyFile: unknown,
  options: RunTaskOptions,
): unknown {
  return runTasksInProcess(tasks, headPolicyFile, { ...options, spawn: spawnFakeGradle });
}

const SOURCE_FILE = 'src/main/java/demo/A.java';
const UNUSED_FIELD_RULE = 'pmd/UnusedPrivateField';

const GRADLE_TEMPLATE_FILES = {
  'nitpicker.config.json': '{ "preset": "java" }\n',
  'build.gradle': "plugins { id 'java' }\n",
  [SOURCE_FILE]: 'package demo;\n\npublic final class A {}\n',
  'violations.txt': 'Avoid unused field: legacy\n',
};

const MAVEN_TEMPLATE_FILES = {
  'nitpicker.config.json': '{ "preset": "java" }\n',
  'pom.xml':
    '<project><modelVersion>4.0.0</modelVersion><groupId>demo</groupId><artifactId>demo</artifactId>' +
    '<version>1</version><build><finalName>demo</finalName></build></project>\n',
  [SOURCE_FILE]: 'package demo;\n\npublic final class A {}\n',
  'violations.txt': 'Avoid unused field: legacy\n',
};

export function kotlinConfig(formatter?: string): string {
  return `${JSON.stringify({ preset: 'kotlin', ...(formatter && { kotlin: { formatter } }) })}\n`;
}

export function useGradleFixtures(runNitpickerCli: RunNitpickerCli): GradleFixtures {
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
    gradleRepository: (files: RepositoryFiles = {}) => fixtures.repository(files),
    kotlinRepository: (files: RepositoryFiles = {}) =>
      fixtures.repository({
        'nitpicker.config.json': kotlinConfig(),
        'detekt.txt': 'Legacy magic number\n',
        'kotlin-mutation-facts.json': EMPTY_MUTATION_FACTS,
        ...files,
      }),
    run: fixtures.run,
    runCli: fixtures.runCli,
    repository: (files: RepositoryFiles = {}) => fixtures.repository(files),
    build: {
      failure: {
        files: { GRADLE_FAIL: 'Execution failed for task :compileJava\n' },
        error: {
          rule: 'gradle-failure',
          message: (snapshot: string, reports: string) =>
            [
              `Java preset failed ${snapshot === 'base' ? 'on the base' : 'on your change'}: ` +
                'Execution failed for task :compileJava',
              `Full Gradle log: ${reports}/logs/java-${snapshot}-gradle.log`,
              linkSentence('gradleFails'),
            ].join('\n'),
        },
      },
      redBase: {
        files: (suite: unknown) => ({ TESTS_FAIL: JSON.stringify({ '': suite }) }),
        repair: { remove: ['TESTS_FAIL'] },
        modules: {
          files: (suite: unknown) => ({
            TESTS_FAIL: JSON.stringify({ core: suite }),
            'modules.txt': 'core\napi\n',
          }),
          repair: { remove: ['TESTS_FAIL'] },
        },
      },
      missingBinary: {
        stub: (binary: string) => vi.stubEnv('NITPICKER_GRADLE', binary),
        rule: 'gradle-failure',
        message: (binary: string, reports: string) =>
          `${binary} was not found. Add the Gradle wrapper (gradlew) to the project, put gradle on ` +
          `the PATH, or set NITPICKER_GRADLE\nFull Gradle log: ${reports}/logs/java-base-gradle.log`,
      },
    },
  };
}

function runTasksWithFakeMaven(
  tasks: readonly object[],
  headPolicyFile: unknown,
  options: RunTaskOptions,
): unknown {
  return runTasksInProcess(tasks, headPolicyFile, { ...options, spawn: spawnFakeMaven });
}

export function useMavenFixtures(runNitpickerCli: RunNitpickerCli): MavenFixtures {
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
    repository: (files: RepositoryFiles = {}) => fixtures.repository(files),
    build: {
      failure: {
        files: { MAVEN_FAIL: 'COMPILATION ERROR in A.java\n' },
        error: {
          rule: 'maven-failure',
          message: (snapshot: string) =>
            `Maven failed in ${snapshot}:\n[ERROR] COMPILATION ERROR in A.java\n${linkSentence('mavenFails')}`,
        },
      },
      redBase: {
        files: (suite: string) => ({ 'test-results/test/TEST-demo.ATest.xml': suite }),
        repair: {
          write: {
            'test-results/test/TEST-demo.ATest.xml':
              '<testsuite name="demo.ATest"><testcase classname="demo.ATest" name="works"/></testsuite>',
          },
        },
      },
      missingBinary: {
        stub: (binary: string) => vi.stubEnv('NITPICKER_MAVEN', binary),
        rule: 'maven-failure',
        message: (binary: string) =>
          `${binary} was not found. Add the Maven wrapper (mvnw) to the project, put mvn on the PATH, or set NITPICKER_MAVEN`,
      },
    },
  };
}

export function unusedFieldMessage(name: string, file = SOURCE_FILE): string {
  const { fix } = readCatalog('pmd').UnusedPrivateField;
  return `Avoid unused field: ${name}. ${fix} ${exceptionHint(UNUSED_FIELD_RULE, file)}`;
}

export function unusedFieldFields(file = SOURCE_FILE): UnusedFieldFields {
  return {
    allowedForm: readCatalog('pmd').UnusedPrivateField.fix,
    exception: { rule: UNUSED_FIELD_RULE, paths: [file], reason: '...' },
    exceptionList: 'exceptions',
  };
}

export function unusedFieldConsoleEntry(name: string, line: number, file = SOURCE_FILE): string {
  const { fix } = readCatalog('pmd').UnusedPrivateField;
  return [
    `  pmd/UnusedPrivateField: Avoid unused field: ${name}. ${fix}`,
    `    ${file}:${String(line)}`,
    `    ${exceptionHint(UNUSED_FIELD_RULE, file)}`,
  ].join('\n');
}
