import path from 'node:path';
import { afterEach, beforeEach, vi } from 'vitest';
import { runTasksInProcess } from '../../../diff/execution/test-support/in-process-analyzers.mjs';
import { usePresetFixtures } from '../../test-support/preset-fixtures.mjs';
import { readCatalog } from '../../../../languages/java/messages/rule-messages.mjs';
import { exceptionHint } from '../../../../shared/rules/exceptions.mjs';

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
  };
}

export function unusedFieldMessage(name, file = 'src/main/java/demo/A.java') {
  const { fix } = readCatalog('pmd').UnusedPrivateField;
  return `Avoid unused field: ${name}. ${fix} ${exceptionHint('pmd/UnusedPrivateField', file)}`;
}
