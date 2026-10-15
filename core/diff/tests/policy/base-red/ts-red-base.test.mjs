import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PACKAGE_ROOT } from '../../../../tooling/tool-resolution.mjs';
import { createTypescriptProject } from './test-support/typescript-project.mjs';

// Real vitest, coverage and the TypeScript preset on a repository whose base fails its tests. It
// runs the CLI on throwaway repositories, so it only runs with NITPICKER_TYPESCRIPT_E2E=1
// (`npm run test:typescript`).

const enabled = process.env.NITPICKER_TYPESCRIPT_E2E === '1';

const PASSING_TEST =
  "import { expect, it } from 'vitest';\nimport { greet } from '../src/greeter.ts';\n\nit('greets', () => {\n  expect(greet('Ada')).toBe('Hello, Ada!');\n});\n";
const FAILING_TEST = PASSING_TEST.replace('Hello, Ada!', 'Hi, Ada!');
const FAILURE_MESSAGE = (expected) =>
  `1 test fails, so coverage, CRAP and mutation were skipped. Fix the tests and rerun:\n  test/greeter.test.ts > greets: AssertionError: expected '${expected}' to be 'Hi, Ada!' // Object.is equality`;
const BRANCHY = (name) =>
  `export function ${name}(value: number): string {\n${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    .map((limit) => `  if (value === ${limit}) {\n    return '${limit}';\n  }\n`)
    .join('')}  return 'other';\n}\n`;

describe.skipIf(!enabled)(
  'TypeScript preset on a base whose tests fail',
  { timeout: 120_000 },
  () => {
    let project;

    beforeAll(() => {
      project = createTypescriptProject({
        packageRoot: PACKAGE_ROOT,
        prefix: 'nitpicker-ts-red-base',
        firstBranch: 'red-base',
        files: {
          'src/greeter.ts': 'export const greet = (name: string): string => `Hello, ${name}!`;\n',
          'src/legacy.ts': BRANCHY('legacy'),
          'test/greeter.test.ts': FAILING_TEST,
        },
      });
      project.commitBranch('repaired', { 'test/greeter.test.ts': PASSING_TEST }, 'red-base');
      project.commitBranch('repaired-new-code', { 'src/added.ts': BRANCHY('added') }, 'repaired');
      project.commitBranch(
        'still-red',
        { 'src/greeter.ts': 'export const greet = (name: string): string => `Hey, ${name}!`;\n' },
        'red-base',
      );
    });

    afterAll(() => {
      project.remove();
    });

    it('passes a change that repairs the tests, with the failing base as a note and the untested legacy code unchanged', () => {
      const result = project.gate('repaired', { base: 'red-base' });

      expect({
        exitCode: result.exitCode,
        toolErrors: result.json('tool-errors.json'),
        notes: result.json('notes.json'),
        enforceable: result.enforceable(),
        unchangedCrapFindings: result.json('summary.json').tools.find(({ name }) => name === 'crap')
          .unchanged,
      }).toEqual({
        exitCode: 0,
        toolErrors: [],
        enforceable: [],
        unchangedCrapFindings: 1,
        notes: [
          {
            tool: 'coverage',
            snapshot: 'base',
            rule: 'tests-failed',
            path: 'test/greeter.test.ts',
            message: FAILURE_MESSAGE('Hello, Ada!'),
          },
        ],
      });
    });

    it('fails an added file that is untested and over the CRAP limit', () => {
      const result = project.gate('repaired-new-code', { base: 'red-base' });

      expect(result.exitCode, result.text).toBe(1);
      expect(result.enforceable()).toEqual([
        ...Array(10).fill('coverage changed-branch-coverage src/added.ts'),
        'crap crap-score-limit src/added.ts',
      ]);
    });

    it('still fails when the head fails its tests too', () => {
      const result = project.gate('still-red', { base: 'red-base' });

      expect(result.exitCode, result.text).toBe(2);
      expect(result.json('tool-errors.json')).toEqual([
        {
          tool: 'coverage',
          snapshot: 'base',
          rule: 'tests-failed',
          path: 'test/greeter.test.ts',
          message: FAILURE_MESSAGE('Hello, Ada!'),
        },
        {
          tool: 'coverage',
          snapshot: 'head',
          rule: 'tests-failed',
          path: 'test/greeter.test.ts',
          message: FAILURE_MESSAGE('Hey, Ada!'),
        },
      ]);
      expect(result.json('notes.json')).toEqual([]);
    });
  },
);
