import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PACKAGE_ROOT } from '../../../../tooling/tool-resolution.mjs';
import { createTypescriptProject } from './test-support/typescript-project.mjs';
import { linkSentence } from '../../../../../shared/messages/test-support/link-sentence.mjs';

const enabled = process.env.NITPICKER_TS_RED_BASE === '1';

const PASSING_TEST =
  "import { expect, it } from 'vitest';\nimport { greet } from '../src/greeter.ts';\n\nit('greets', () => {\n  expect(greet('Ada')).toBe('Hello, Ada!');\n});\n";
const FAILING_TEST = PASSING_TEST.replace('Hello, Ada!', 'Hi, Ada!');
const ASSERTION = (expected) =>
  `test/greeter.test.ts > greets: AssertionError: expected '${expected}' to be 'Hi, Ada!' // Object.is equality`;
const FAILURE_MESSAGE = (expected) =>
  `1 test fails, so coverage, CRAP and mutation were skipped. Fix the tests and rerun:\n  ${ASSERTION(expected)}`;
const BASE_NOTE = `Tests fail on the base:\n  ${ASSERTION('Hello, Ada!')}\n${linkSentence('baseTestsFail')}`;
const BRANCHY = (name) =>
  `export function ${name}(value: number): string {\n${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    .map((limit) => `  if (value === ${limit}) {\n    return '${limit}';\n  }\n`)
    .join('')}  return 'other';\n}\n`;

describe.skipIf(!enabled)('TypeScript preset on a base whose tests fail', () => {
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
    project.commitBranch('repaired-by-deleting', { 'test/greeter.test.ts': null }, 'red-base');
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
          message: BASE_NOTE,
        },
      ],
    });
  });

  it('passes a change that only repairs the tests with every default analyzer too', () => {
    const result = project.gate('repaired', { base: 'red-base', analyzers: [] });

    expect({
      exitCode: result.exitCode,
      toolErrors: result.json('tool-errors.json'),
      enforceable: result.enforceable(),
      notes: result.json('notes.json').map(({ tool, rule }) => `${tool} ${rule}`),
    }).toEqual({ exitCode: 0, toolErrors: [], enforceable: [], notes: ['coverage tests-failed'] });
  });

  it('fails a change that repairs the tests by deleting them, as it would on a green base', () => {
    const result = project.gate('repaired-by-deleting', { base: 'red-base' });

    expect(result.exitCode, result.text).toBe(1);
    expect(result.enforceable()).toEqual([
      'crap crap-coverage-unknown src/greeter.ts',
      'crap crap-coverage-unknown src/legacy.ts',
    ]);
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
        message: BASE_NOTE,
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
});
