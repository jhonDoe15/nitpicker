import { rmSync } from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { createProject, lintProject, TYPED_POLICY } from '../test-support/oxlint-project.mjs';

const PINNED_OPTIONS = { types: [], lib: ['ES2022'] };
const CONSUMER = [
  'declare const value: string | null;',
  'export const needed = value as string;',
  'export const redundant = value as string | null;',
  '',
].join('\n');

function lintConfig(types = []) {
  return JSON.stringify({
    extends: './tsconfig.json',
    compilerOptions: { allowJs: true, noEmit: true, skipLibCheck: true, lib: ['ES2022'], types },
    include: ['src/**/*.ts', 'gen/**/*.ts'],
  });
}

const PROJECTS = [
  {
    name: 'isolatedDeclarations next to the lint allowJs',
    files: {
      'tsconfig.json': JSON.stringify({
        compilerOptions: { ...PINNED_OPTIONS, declaration: true, isolatedDeclarations: true },
      }),
    },
  },
  {
    name: 'a relative rootDir in an extended config',
    files: {
      'configs/base.json': JSON.stringify({
        compilerOptions: { ...PINNED_OPTIONS, rootDir: '..' },
      }),
      'tsconfig.json': JSON.stringify({
        extends: './configs/base.json',
        compilerOptions: PINNED_OPTIONS,
      }),
    },
  },
  {
    name: 'a relative rootDir below the project root',
    files: {
      'tsconfig.json': JSON.stringify({ compilerOptions: { ...PINNED_OPTIONS, rootDir: './src' } }),
    },
  },
  {
    name: 'rootDirs that merge a generated folder into src',
    files: {
      'tsconfig.json': JSON.stringify({
        compilerOptions: { ...PINNED_OPTIONS, composite: true, rootDirs: ['./src', './gen'] },
      }),
      'gen/value.ts': 'export declare const value: string | null;\n',
      'src/consumer.ts': [
        "import { value } from './value';",
        ...CONSUMER.split('\n').slice(1),
      ].join('\n'),
    },
  },
  {
    name: 'type definitions that are not installed',
    types: ['missing'],
    files: { 'tsconfig.json': JSON.stringify({ compilerOptions: PINNED_OPTIONS }) },
  },
  {
    name: 'options TypeScript 7 removed',
    files: {
      'tsconfig.json': JSON.stringify({
        compilerOptions: {
          ...PINNED_OPTIONS,
          target: 'es5',
          module: 'amd',
          moduleResolution: 'node',
          outFile: 'out.js',
          downlevelIteration: true,
          esModuleInterop: false,
          allowSyntheticDefaultImports: false,
          alwaysStrict: false,
        },
      }),
    },
  },
];

const roots = [];

afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

describe('lintWithOxlint with the project tsconfig', () => {
  it.each(PROJECTS)('accepts $name', async ({ files, types }) => {
    const root = createProject('nitpicker-oxlint-stage-tsconfig-test-', {
      'policy.mjs': TYPED_POLICY,
      'tsconfig.nitpicker.json': lintConfig(types),
      'src/consumer.ts': CONSUMER,
      ...files,
    });
    roots.push(root);

    const results = await lintProject({
      root,
      patterns: ['src/consumer.ts'],
      projectConfigName: 'tsconfig.nitpicker.json',
    });

    expect(
      results.flatMap((result) => result.messages.map(({ ruleId, line }) => ({ ruleId, line }))),
    ).toEqual([{ ruleId: '@typescript-eslint/no-unnecessary-type-assertion', line: 3 }]);
    expect(results.map((result) => path.basename(result.filePath))).toEqual(['consumer.ts']);
  });
});

const HOISTED_CONSUMER = [
  'export const needed = hoistedValue as string;',
  'export const redundant = hoistedValue as string | null;',
  '',
].join('\n');
const HOISTED_GLOBAL = 'declare const hoistedValue: string | null;\n';

const HOISTED_LAYOUTS = [
  {
    name: 'listed @types package',
    types: ['hoisted'],
    file: 'node_modules/@types/hoisted/index.d.ts',
  },
  {
    name: 'package subpath',
    types: ['hoisted/globals'],
    file: 'node_modules/hoisted/globals.d.ts',
  },
];

describe('lintWithOxlint in a workspace package', () => {
  it.each(HOISTED_LAYOUTS)('sees a $name hoisted above the package', async ({ types, file }) => {
    const workspace = createProject('nitpicker-oxlint-stage-tsconfig-test-', {
      [file]: HOISTED_GLOBAL,
      'pkg/node_modules/.keep': '',
      'pkg/policy.mjs': TYPED_POLICY,
      'pkg/tsconfig.nitpicker.json': lintConfig(types),
      'pkg/tsconfig.json': JSON.stringify({ compilerOptions: PINNED_OPTIONS }),
      'pkg/src/consumer.ts': HOISTED_CONSUMER,
    });
    roots.push(workspace);

    const results = await lintProject({
      root: path.join(workspace, 'pkg'),
      patterns: ['src/consumer.ts'],
      projectConfigName: 'tsconfig.nitpicker.json',
    });

    expect(
      results.flatMap((result) => result.messages.map(({ ruleId, line }) => ({ ruleId, line }))),
    ).toEqual([{ ruleId: '@typescript-eslint/no-unnecessary-type-assertion', line: 2 }]);
  });
});

describe('lintWithOxlint with a tsconfig oxlint rejects', () => {
  it('fails loudly instead of dropping the type-aware findings', async () => {
    const options = { module: 'esnext', moduleResolution: 'node16' };
    const root = createProject('nitpicker-oxlint-stage-tsconfig-test-', {
      'policy.mjs': TYPED_POLICY,
      'tsconfig.nitpicker.json': lintConfig(),
      'tsconfig.json': JSON.stringify({ compilerOptions: { ...PINNED_OPTIONS, ...options } }),
      'src/consumer.ts': CONSUMER,
    });
    roots.push(root);

    const failure = lintProject({
      root,
      patterns: ['src/consumer.ts'],
      projectConfigName: 'tsconfig.nitpicker.json',
    });

    await expect(failure).rejects.toThrow(
      /^oxlint rejected the tsconfig .* type-aware lint rule: /u,
    );
    await expect(failure).rejects.toThrow(/'module' must be set to 'Node16'/u);
    await expect(failure).rejects.toThrow(
      /troubleshooting\.md#the-typescript-config-cannot-be-read$/u,
    );
  });
});
