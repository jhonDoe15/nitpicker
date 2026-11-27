import { afterAll, describe, expect, it, vi } from 'vitest';
import { rmSync } from 'node:fs';
import path from 'node:path';
import { createProject, lintProject } from '../test-support/oxlint-project.mts';

const rejection = vi.hoisted(() => ({ pending: 0, residual: false }));

vi.mock('./stage-lint.mts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./stage-lint.mts')>();
  return {
    ...actual,
    lintConfigs: (run: Parameters<typeof actual.lintConfigs>[0]) => {
      if (rejection.pending > 0) {
        rejection.pending -= 1;
        return Promise.reject(new Error('Invalid configuration for rule `no-debugger`: rejected'));
      }
      return actual.lintConfigs(run);
    },
  };
});

vi.mock('./residual-run.mts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./residual-run.mts')>();
  return {
    ...actual,
    residualRun: (...parameters: Parameters<typeof actual.residualRun>) =>
      rejection.residual
        ? Promise.reject(new Error('ESLint failed'))
        : actual.residualRun(...parameters),
  };
});

const POLICY = `import tseslint from ${JSON.stringify(import.meta.resolve('typescript-eslint'))};

export default [
  {
    files: ['src/**/*.ts'],
    languageOptions: { parser: tseslint.parser },
    rules: { 'no-debugger': 'error' },
  },
];
`;

const root = createProject('nitpicker-oxlint-rejected-', {
  'policy.mjs': POLICY,
  'src/plain.ts': 'debugger;\n',
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

function linted(patterns: readonly string[]) {
  return lintProject({ root, patterns, runEslintCli: () => Promise.resolve([]) });
}

describe('oxlint configurations rejected while linting', () => {
  it('bridges the rejected rule and lints again', async () => {
    rejection.pending = 1;
    const results = await linted(['src/**/*.ts']);

    expect(rejection.pending).toBe(0);
    expect(
      results.map(({ filePath, messages }) => [
        path.relative(root, filePath),
        messages.map(({ ruleId }) => ruleId),
      ]),
    ).toEqual([['src/plain.ts', ['no-debugger']]]);
  });

  it('stops when the same rule is rejected again after it was bridged', async () => {
    rejection.pending = 2;
    await expect(linted(['src/**/*.ts'])).rejects.toThrow(
      'Invalid configuration for rule `no-debugger`',
    );
  });

  it('stops when the residual ESLint pass fails', async () => {
    rejection.residual = true;
    await expect(linted(['src/**/*.ts'])).rejects.toThrow('ESLint failed');
    rejection.residual = false;
  });

  it('lints nothing when no file matches', async () => {
    expect(await linted(['missing/**/*.ts'])).toEqual([]);
  });
});
