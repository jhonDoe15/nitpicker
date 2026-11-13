import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ESLint } from 'eslint';
import { afterAll, describe, expect, it } from 'vitest';
import { normalizeEslintResults } from '../../../adapters/eslint/normalize.mjs';
import { lintWithOxlint } from '../../../adapters/oxlint/oxlint-runner.mjs';
import { createProject } from '../../../adapters/oxlint/test-support/oxlint-project.mjs';
import { UNSAFE_ANY_RULES, untypedJavascriptConfig } from './untyped-javascript.mjs';

const PATTERNS = ['src/**/*.{ts,mjs}'];
const roots = [];

afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

const POLICY = `import tseslint from ${JSON.stringify(import.meta.resolve('typescript-eslint'))};
import { untypedJavascriptConfig } from ${JSON.stringify(import.meta.resolve('./untyped-javascript.mjs'))};
import { resolveLayout } from ${JSON.stringify(import.meta.resolve('../../layout.mjs'))};

const parserOptions = { project: './tsconfig.json', tsconfigRootDir: import.meta.dirname };
export default [
  ...tseslint.configs.strictTypeChecked,
  { files: ['src/**/*.{ts,mjs}'], languageOptions: { parserOptions } },
  ...untypedJavascriptConfig({
    tsconfigFile: new URL('tsconfig.json', import.meta.url).pathname,
    layout: resolveLayout(),
  }),
];
`;

const UNTYPED = [
  'export function read(value) {',
  '  const name = value.name;',
  "  return [value.id, name].join(':');",
  '}',
].join('\n');
const TYPED = 'export const read = (value: { name: string }): string => value.name;\n';

function tsconfig(options) {
  return JSON.stringify({
    compilerOptions: {
      noEmit: true,
      types: [],
      lib: ['ES2023'],
      strict: true,
      target: 'es2023',
      module: 'nodenext',
      allowJs: true,
      ...options,
    },
    include: ['src'],
  });
}

function project(options) {
  const root = createProject('nitpicker-untyped-js-', {
    'policy.mjs': POLICY,
    'tsconfig.json': tsconfig(options),
    'src/untyped.mjs': UNTYPED,
    'src/typed.ts': TYPED,
    'src/unsafe.ts': 'export function read(value: any) {\n  return value.name;\n}\n',
  });
  roots.push(root);
  return root;
}

function located(root, results) {
  return normalizeEslintResults({ value: results, projectRoot: root, analyzerName: 'eslint-lint' })
    .filter(({ rule }) => UNSAFE_ANY_RULES.includes(rule))
    .map(({ path: file }) => file);
}

async function eslintFiles(root) {
  const eslint = new ESLint({ cwd: root, overrideConfigFile: path.join(root, 'policy.mjs') });
  return located(root, await eslint.lintFiles(PATTERNS));
}

async function oxlintFiles(root) {
  const results = await lintWithOxlint({
    options: { projectRoot: root, patterns: PATTERNS },
    environment: {
      ...process.env,
      NITPICKER_DIFF_ESLINT_POLICY_CONFIG: path.join(root, 'policy.mjs'),
      NITPICKER_DIFF_ESLINT_PROJECT_ROOT: root,
    },
    runEslintCli: () => [],
  });
  return located(root, results);
}

describe('unsafe-any rules on JavaScript in a TypeScript project', () => {
  it('skip an untyped .mjs file but keep checking TypeScript, without checkJs', async () => {
    const root = project({ checkJs: false });
    const [fromEslint, fromOxlint] = await Promise.all([eslintFiles(root), oxlintFiles(root)]);

    expect(new Set(fromEslint)).toEqual(new Set(['src/unsafe.ts']));
    expect(new Set(fromOxlint)).toEqual(new Set(['src/unsafe.ts']));
  });

  it('check the .mjs file too when the tsconfig sets checkJs', async () => {
    const root = project({ checkJs: true });
    const [fromEslint, fromOxlint] = await Promise.all([eslintFiles(root), oxlintFiles(root)]);

    expect(new Set(fromEslint)).toEqual(new Set(['src/unsafe.ts', 'src/untyped.mjs']));
    expect(new Set(fromOxlint)).toEqual(new Set(['src/unsafe.ts', 'src/untyped.mjs']));
  });

  it('follows a checkJs setting inherited through extends', async () => {
    const root = project({});
    mkdirSync(path.join(root, 'config'));
    writeFileSync(path.join(root, 'config/base.json'), tsconfig({ checkJs: true }));
    writeFileSync(
      path.join(root, 'tsconfig.json'),
      '{ "extends": "./config/base.json", "include": ["src"] }',
    );

    expect(new Set(await eslintFiles(root))).toEqual(new Set(['src/unsafe.ts', 'src/untyped.mjs']));
  });
});

describe('untypedJavascriptConfig', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'nitpicker-untyped-config-'));
  roots.push(dir);

  function config(options, layout = {}) {
    writeFileSync(path.join(dir, 'tsconfig.json'), tsconfig(options));
    return untypedJavascriptConfig({ tsconfigFile: path.join(dir, 'tsconfig.json'), layout });
  }

  it('turns the seven rules off for JavaScript files without checkJs', () => {
    const [entry] = config({});

    expect(Object.keys(entry.rules).sort()).toEqual([...UNSAFE_ANY_RULES].sort());
    expect(new Set(Object.values(entry.rules))).toEqual(new Set(['off']));
    expect(entry.files).toEqual(['**/*.{js,mjs,cjs,jsx}']);
  });

  it('adds nothing with checkJs, in the JavaScript preset, or when the tsconfig is missing', () => {
    expect(config({ checkJs: true })).toEqual([]);
    expect(config({}, { javascript: true })).toEqual([]);
    expect(
      untypedJavascriptConfig({ tsconfigFile: path.join(dir, 'missing.json'), layout: {} }),
    ).toHaveLength(1);
  });
});
