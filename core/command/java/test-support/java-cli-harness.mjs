import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, expect, vi } from 'vitest';
import { exactText } from '../../../diff/reporting/test-support/output-expectations.mjs';
import { runTasksInProcess } from '../../../diff/execution/test-support/in-process-analyzers.mjs';
import { usePresetFixtures } from '../../test-support/preset-fixtures.mjs';
import { readCatalog } from '../../../../languages/java/messages/rule-messages.mjs';
import { exceptionHint } from '../../../../shared/rules/exceptions.mjs';
import { fakeJdk } from './fake-jdk.mjs';
import { fakeMaven } from './fake-maven.mjs';

const EXECUTABLE_MODE = 0o755;

export const fakeGradle = path.resolve(
  import.meta.dirname,
  '../../../../languages/java/adapters/fixtures/fake-gradle.mjs',
);

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
    runOptions: { runTasks: runTasksInProcess },
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
            exactText`Full Gradle log: ${tmpdir()}/nitpicker-gradle-failure-${/[A-Za-z0-9]{6}/}/gradle.log\nspawnSync ${binary} ENOENT`,
          ),
      },
    },
  };
}

function writeFakeTool(file, exportName, moduleUrl, leadingArguments = []) {
  const source = `import { ${exportName} } from "${moduleUrl}"; process.exitCode = ${exportName}.run(process.argv.slice(1), process);`;
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(
    file,
    `#!/bin/sh\nexec "${process.execPath}" --input-type=module -e '${source}' -- ${leadingArguments.join(' ')} "$@"\n`,
  );
  chmodSync(file, EXECUTABLE_MODE);
}

function writeFakeJdk(directory) {
  for (const name of fakeJdk.tools) {
    writeFakeTool(path.join(directory, 'bin', name), 'fakeJdk', fakeJdk.url, [name]);
  }
}

export function useMavenFixtures(runNitpickerCli) {
  const fixtures = usePresetFixtures({
    runCli: runNitpickerCli,
    name: 'java',
    templateFiles: MAVEN_TEMPLATE_FILES,
    runOptions: { runTasks: runTasksInProcess },
  });
  beforeEach(() => {
    const jdk = fixtures.temporaryRoot('nitpicker-fake-jdk-');
    writeFakeJdk(jdk);
    const maven = path.join(fixtures.temporaryRoot('nitpicker-fake-maven-'), 'mvn');
    writeFakeTool(maven, 'fakeMaven', fakeMaven.url);
    vi.stubEnv('NITPICKER_MAVEN', maven);
    vi.stubEnv('JAVA_HOME', jdk);
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
            `Maven failed in ${snapshot}:\n[ERROR] COMPILATION ERROR in A.java`,
        },
      },
      missingBinary: {
        stub: (binary) => vi.stubEnv('NITPICKER_MAVEN', binary),
        rule: 'maven-failure',
        message: (binary) =>
          `${binary} was not found. Add the Maven wrapper (mvnw) to the project, put mvn on the PATH, or set NITPICKER_MAVEN`,
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
${detail}`);
}
