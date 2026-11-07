import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PACKAGE_ROOT } from '../../../../core/tooling/tool-resolution.mjs';
import { createTypescriptProject } from '../../../../core/diff/tests/policy/base-red/test-support/typescript-project.mjs';

const enabled = process.env.NITPICKER_TS_RED_BASE === '1';

const GREETER_TEST =
  "import { expect, it } from 'vitest';\nimport { greet } from '../src/greeter.ts';\n\nit('greets', () => {\n  expect(greet('Ada')).toBe('Hello, Ada!');\n});\n";
const UNREACHED = 'export const half = (value: number): number => value / 2;\n';
const UNREACHED_MUTANTS = Array(2).fill('mutation mutant-nocoverage src/unreached.ts');

describe.skipIf(!enabled)('TypeScript mutants that no test reaches', () => {
  let project;

  beforeAll(() => {
    project = createTypescriptProject({
      packageRoot: PACKAGE_ROOT,
      prefix: 'nitpicker-ts-unreached',
      files: {
        'src/greeter.ts': 'export const greet = (name: string): string => `Hello, ${name}!`;\n',
        'test/greeter.test.ts': GREETER_TEST,
      },
    });
    project.commitBranch('unreached', { 'src/unreached.ts': UNREACHED }, 'main');
  });

  afterAll(() => {
    project.remove();
  });

  it('are not covered in a diff run that mutates only unreached code', () => {
    const result = project.gate('unreached', { base: 'main', analyzers: ['mutation'] });

    expect(result.exitCode, result.text).toBe(1);
    expect(result.enforceable()).toEqual(UNREACHED_MUTANTS);
  });

  it('are not covered in a full run either', () => {
    const result = project.gate('unreached', {
      analyzers: ['mutation'],
      extraArguments: ['--all'],
    });

    expect(
      result
        .json('findings.json')
        .filter(({ classification }) => classification === 'enforceable')
        .map(({ tool, rule, path }) => `${tool} ${rule} ${path}`),
    ).toEqual(UNREACHED_MUTANTS);
  });
});
