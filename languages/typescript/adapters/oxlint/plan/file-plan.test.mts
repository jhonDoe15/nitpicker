import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { filePlan } from '../oxlint-plan.mts';

const METADATA_RULE = '@typescript-eslint/consistent-type-imports';

const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-oxlint-plan-'));
mkdirSync(path.join(root, 'src'));
const SOURCES: Readonly<Record<string, string>> = {
  'src/a.ts': '@Injectable()\nexport class A {}\n',
  'src/b.ts': 'export const b = 1;\n',
  'src/c.ts': '@Injectable()\nexport class C {}\n',
  'src/d.ts': '@Injectable()\nexport class D {}\n',
  'src/e.ts': 'export const e = 1;\n',
  'src/f.ts': 'export const f = 1;\n',
  'src/g.ts': 'export const g = 1;\n',
  'tsconfig.json': JSON.stringify({
    compilerOptions: { experimentalDecorators: true, emitDecoratorMetadata: true },
  }),
  'tsconfig.plain.json': JSON.stringify({ compilerOptions: { experimentalDecorators: true } }),
};
for (const [file, text] of Object.entries(SOURCES)) {
  writeFileSync(path.join(root, file), text);
}

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

const decorated = {
  rules: {
    [METADATA_RULE]: 'error',
    'typed/checked': ['warn', { strict: true }],
    'quiet-rule': 'off',
    'typed/quiet': ['off'],
    'core-rule': 2,
  },
  plugins: {
    typed: {
      rules: {
        checked: { meta: { docs: { requiresTypeChecking: true }, messages: { found: 'Found' } } },
      },
    },
    '@': { rules: { 'core-rule': { meta: { messages: { core: 'Core' } } } } },
  },
  languageOptions: {
    parserOptions: { project: true, tsconfigRootDir: root },
    globals: { zeta: true, alpha: 'off', beta: 'readonly', gamma: 'writeable', delta: 'writable' },
  },
  linterOptions: { noInlineConfig: true },
  settings: { react: { version: '19' } },
};

const plainProject = {
  rules: { [METADATA_RULE]: 'error' },
  languageOptions: {
    parserOptions: { project: ['tsconfig.plain.json', 3], tsconfigRootDir: root },
  },
};

const noRoot = {
  rules: { [METADATA_RULE]: 'error' },
  languageOptions: { parserOptions: { project: true } },
};

const CONFIGS: Readonly<Record<string, unknown>> = {
  'src/a.ts': decorated,
  'src/b.ts': decorated,
  'src/c.ts': plainProject,
  'src/d.ts': noRoot,
  'src/e.ts': null,
  'src/f.ts': 'not a config',
  'src/g.ts': undefined,
};

function configOf(file: string): Promise<unknown> {
  return Promise.resolve(CONFIGS[file]);
}

describe('planning oxlint groups from the ESLint configs', () => {
  it('groups files by their enabled rules and keeps decorator metadata rules on the program', async () => {
    const plan = await filePlan(root, ['src/*.ts'], () => Promise.resolve(configOf));
    const empty = { rules: {}, globals: {}, settings: {} };

    expect(plan.groups).toEqual([
      {
        files: ['src/a.ts'],
        rules: {
          [METADATA_RULE]: 'error',
          'core-rule': 2,
          'typed/checked': ['warn', { strict: true }],
        },
        globals: {
          alpha: 'off',
          beta: 'readonly',
          delta: 'writable',
          gamma: 'writable',
          zeta: 'writable',
        },
        settings: { react: { version: '19' } },
        programRules: [METADATA_RULE],
      },
      {
        files: ['src/b.ts'],
        rules: {
          [METADATA_RULE]: 'error',
          'core-rule': 2,
          'typed/checked': ['warn', { strict: true }],
        },
        globals: {
          alpha: 'off',
          beta: 'readonly',
          delta: 'writable',
          gamma: 'writable',
          zeta: 'writable',
        },
        settings: { react: { version: '19' } },
      },
      {
        files: ['src/c.ts', 'src/d.ts'],
        rules: { [METADATA_RULE]: 'error' },
        globals: {},
        settings: {},
      },
      { files: ['src/e.ts', 'src/f.ts'], ...empty },
    ]);
    expect(plan.noInlineConfig).toEqual(['src/a.ts', 'src/b.ts']);
    expect(plan.typedPluginRules).toEqual(['typed/checked']);
    expect(plan.ruleMessages).toEqual({
      [METADATA_RULE]: {},
      'core-rule': { core: 'Core' },
      'typed/checked': { found: 'Found' },
    });
  });

  it('resolves no config when no file matches', async () => {
    const plan = await filePlan(root, ['missing/*.ts'], () => {
      throw new Error('no file needs a config');
    });

    expect(plan.groups).toEqual([]);
  });
});
