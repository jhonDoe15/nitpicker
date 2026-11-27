import { ESLint, type Linter } from 'eslint';
import { describe, expect, it } from 'vitest';
import { configKeyOf } from './config-key.mts';

const ROOT = '/project';

const PATHS = [
  'index.ts',
  'index.js',
  'index.cjs',
  'README.md',
  '.eslintrc.ts',
  'src/a.ts',
  'src/a.test.ts',
  'src/deep/b.tsx',
  'src/deep/b.spec.tsx',
  'src/__tests__/c.ts',
  'src/__tests__/nested/d.ts',
  'src/generated/e.ts',
  'src/generated/keep/f.ts',
  'lib/g.mjs',
  'node_modules/pkg/index.js',
  'packages/one/node_modules/pkg/index.ts',
  'dist/out.js',
  'dist/keep.js',
  'build/keep/x.ts',
  '.storybook/main.ts',
  'tests/h.ts',
  'tests/fixtures/i.ts',
  'scripts/j.cts',
  'docs/k.mdx',
];

async function eslintGroups(entries: Linter.Config[]) {
  const eslint = new ESLint({ cwd: ROOT, overrideConfigFile: true, overrideConfig: entries });
  const configs = await Promise.all(
    PATHS.map(async (file): Promise<unknown> => eslint.calculateConfigForFile(file)),
  );
  return partition(configs);
}

function partition(values: readonly unknown[]) {
  const ids = new Map<unknown, number>();
  return values.map((value) => {
    if (value === undefined) {
      return -1;
    }
    const known = ids.get(value) ?? ids.size;
    ids.set(value, known);
    return known;
  });
}

async function bothGroups(entries: Linter.Config[]) {
  const keyOf = configKeyOf(entries);
  return {
    ours: keyOf === undefined ? undefined : partition(PATHS.map(keyOf)),
    eslint: await eslintGroups(entries),
  };
}

function rule(name: string): Linter.RulesRecord {
  return { [name]: 'error' };
}

describe('config keys computed without ESLint', () => {
  it('groups files the way ESLint does for files, local ignores and globstar patterns', async () => {
    const { ours, eslint } = await bothGroups([
      { files: ['**/*.ts', '**/*.tsx', '**/*.cts'], rules: rule('no-var') },
      { files: ['src/**/__tests__/**', '**/*.{test,spec}.{ts,tsx}'], rules: rule('no-eval') },
      {
        files: ['src/**'],
        ignores: ['src/deep/**', '!src/deep/b.tsx', '!./src/deep/b.spec.tsx'],
        rules: rule('eqeqeq'),
      },
      { files: [['**/*.ts', 'src/**']], rules: rule('no-new') },
      { files: ['./scripts/*.cts'], rules: rule('no-alert') },
      { ignores: ['**/*.test.ts'], rules: rule('curly') },
    ]);

    expect(ours).toEqual(eslint);
  });

  it('applies global ignores, ignored directories and negated ignores like ESLint', async () => {
    const { ours, eslint } = await bothGroups([
      { ignores: ['dist/**', '!dist/keep.js', 'build/', '!build/keep/'] },
      { ignores: ['src/generated/', '!src/generated/keep/'] },
      { ignores: ['tests/fixtures/**', '.storybook/**'], name: 'ignored' },
      { files: ['**/*.ts', '**/*.js', '**/*.mjs'], rules: rule('no-var') },
    ]);

    expect(ours).toEqual(eslint);
  });

  it('counts a file only matched by universal patterns as unconfigured', async () => {
    const { ours, eslint } = await bothGroups([
      { files: ['**/*'], rules: rule('no-var') },
      { files: ['docs/**', '**/*.mdx'], rules: rule('no-eval') },
      { files: ['src/*', 'lib/**/*.mjs'], rules: rule('eqeqeq') },
    ]);

    expect(ours).toEqual(eslint);
  });

  it('leaves configs with function matchers or base paths to ESLint', () => {
    const matcher = (file: string) => file.endsWith('.ts');
    const withFunction: unknown[] = [{ files: [matcher], rules: rule('no-var') }];
    const withBasePath: unknown[] = [{ basePath: 'src', files: ['**/*.ts'] }];

    expect(configKeyOf(withFunction)).toBeUndefined();
    expect(configKeyOf(withBasePath)).toBeUndefined();
    expect(configKeyOf([[{ files: ['**/*.ts'] }]])).toBeUndefined();
    expect(configKeyOf([{ ignores: [matcher] }])).toBeUndefined();
    expect(configKeyOf([null])).toBeUndefined();
  });
});
