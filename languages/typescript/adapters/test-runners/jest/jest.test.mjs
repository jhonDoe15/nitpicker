import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  PICK_SOURCE,
  UNCOVERED_ELSE,
  failingTestFilesOf,
  rulesOf,
  runArea,
  toolErrors,
  createRunnerProjects,
} from '../test-support/runner-project.mjs';

const projects = createRunnerProjects();

const TSCONFIG = {
  compilerOptions: { strict: true, esModuleInterop: true, types: ['jest', 'node'] },
};

const SAYS_YES = "it('says yes', () => {\n  expect(pick(true)).toBe('yes');\n});\n";

const NEST_JEST = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: { '^.+\\.(t|j)s$': 'ts-jest' },
  testEnvironment: 'node',
};

function jestProject(
  testText,
  jest = { preset: 'ts-jest', testEnvironment: 'node' },
  test = 'jest',
) {
  return projects.project({
    'package.json': { name: 'p', private: true, scripts: { test }, jest },
    'tsconfig.json': TSCONFIG,
    'src/main/pick.ts': PICK_SOURCE,
    'test/pick.test.ts': `import { pick } from '../src/main/pick';\n${testText}`,
  });
}

function uncoveredBranch(findings) {
  return findings.find(({ rule }) => rule === 'changed-branch-coverage')?.message;
}

afterEach(() => {
  projects.remove();
});

describe('coverage on a Jest project', () => {
  it('runs the tests with Jest and reports the arm no test takes', async () => {
    const findings = await runArea('coverage', jestProject(SAYS_YES));

    expect(uncoveredBranch(findings)).toMatch(UNCOVERED_ELSE);
    expect(findings.find(({ identity }) => identity === 'test-count')?.metric).toEqual({
      name: 'testCount',
      value: 1,
    });
  });

  it('reports the coverage of a NestJS project whose Jest rootDir is the source folder', async () => {
    const root = projects.project({
      'package.json': { name: 'p', private: true, scripts: { test: 'jest' }, jest: NEST_JEST },
      'tsconfig.json': TSCONFIG,
      'src/main/pick.ts': PICK_SOURCE,
      'src/main/pick.spec.ts': `import { pick } from './pick';\n${SAYS_YES}`,
    });

    const findings = await runArea('coverage', root);

    expect(uncoveredBranch(findings)).toMatch(UNCOVERED_ELSE);
  });

  it('reports the coverage of a Jest config that lists projects', async () => {
    const unit = { displayName: 'unit', preset: 'ts-jest', testEnvironment: 'node' };

    const findings = await runArea(
      'coverage',
      jestProject(SAYS_YES, { projects: [unit] }, 'jest --selectProjects unit'),
    );

    expect(uncoveredBranch(findings)).toMatch(UNCOVERED_ELSE);
  });

  it('fails instead of passing when Jest instruments none of the source files', async () => {
    const root = jestProject(SAYS_YES, { projects: ['<rootDir>/test'] });
    writeFileSync(
      path.join(root, 'test/jest.config.js'),
      "module.exports = { preset: 'ts-jest', testEnvironment: 'node' };\n",
    );

    await expect(runArea('coverage', root)).rejects.toThrow(
      new Error(
        "Jest collected no coverage for the project's source files, such as src/main/pick.ts. " +
          'Jest only instruments files inside the rootDir of the config that runs the test ' +
          `(the global rootDir is ${root}). ` +
          "Make the project's Jest config, or each of its projects, use a rootDir that holds the sources.",
      ),
    );
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

  it('keeps the coverage of the passing tests when another test file fails', async () => {
    const root = projects.project({
      'package.json': {
        name: 'p',
        private: true,
        scripts: { test: 'jest' },
        jest: { preset: 'ts-jest', testEnvironment: 'node' },
      },
      'tsconfig.json': TSCONFIG,
      'src/main/pick.ts': PICK_SOURCE,
      'test/pick.test.ts': `import { pick } from '../src/main/pick';\n${SAYS_YES}`,
      'test/fails.test.ts': `import { pick } from '../src/main/pick';\nit('says no', () => {\n  expect(pick(true)).toBe('no');\n});\n`,
    });

    const findings = await runArea('coverage', root);

    expect(toolErrors(findings)).toEqual([{ tool: 'tests', rule: 'tests-failed' }]);
    expect(uncoveredBranch(findings)).toMatch(UNCOVERED_ELSE);
    expect(failingTestFilesOf(root)).toEqual(['test/fails.test.ts']);
  });

  it('says so when the Jest config finds none of the test files', async () => {
    const findings = await runArea(
      'coverage',
      jestProject(SAYS_YES, {
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
