import { afterEach, describe, expect, it } from 'vitest';
import {
  PICK_SOURCE,
  UNCOVERED_ELSE,
  rulesOf,
  runArea,
  createRunnerProjects,
} from '../test-support/runner-project.mjs';

const projects = createRunnerProjects();

const TSCONFIG = {
  compilerOptions: { strict: true, esModuleInterop: true, types: ['jest', 'node'] },
};

function jestProject(testText, jest = { preset: 'ts-jest', testEnvironment: 'node' }) {
  return projects.project({
    'package.json': { name: 'p', private: true, scripts: { test: 'jest' }, jest },
    'tsconfig.json': TSCONFIG,
    'src/main/pick.ts': PICK_SOURCE,
    'test/pick.test.ts': `import { pick } from '../src/main/pick';\n${testText}`,
  });
}

afterEach(() => {
  projects.remove();
});

describe('coverage on a Jest project', () => {
  it('runs the tests with Jest and reports the arm no test takes', async () => {
    const findings = await runArea(
      'coverage',
      jestProject("it('says yes', () => {\n  expect(pick(true)).toBe('yes');\n});\n"),
    );

    expect(findings.find(({ rule }) => rule === 'changed-branch-coverage')?.message).toMatch(
      UNCOVERED_ELSE,
    );
    expect(findings.find(({ identity }) => identity === 'test-count')?.metric).toEqual({
      name: 'testCount',
      value: 1,
    });
  });

  it('names the failing Jest test', async () => {
    const findings = await runArea(
      'coverage',
      jestProject("it('says no', () => {\n  expect(pick(true)).toBe('no');\n});\n"),
    );

    expect(rulesOf(findings)).toEqual(['tool-error:tests-failed']);
    expect(findings[0].message).toMatch(
      /test\/pick\.test\.ts > says no: .*expect\(received\)\.toBe/u,
    );
  });

  it('says so when the Jest config finds none of the test files', async () => {
    const findings = await runArea(
      'coverage',
      jestProject("it('says yes', () => {\n  expect(pick(true)).toBe('yes');\n});\n", {
        preset: 'ts-jest',
        testMatch: ['**/*.check.ts'],
      }),
    );

    expect(findings).toEqual([
      {
        tool: 'coverage',
        rule: 'tests-failed',
        path: 'test/pick.test.ts',
        identity: 'tests-failed',
        message:
          'Jest ran no tests, but nitpicker sees test files such as test/pick.test.ts. ' +
          'Make the project\'s Jest config find them, or set "tools.tests.runner" in ' +
          'nitpicker.config.json to the runner they are written for.',
        classification: 'tool-error',
      },
    ]);
  });
});
