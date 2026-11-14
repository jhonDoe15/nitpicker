import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ESLint } from 'eslint';
import { pathToFileURL } from 'node:url';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { normalizeEslintResults } from '../../../adapters/eslint/normalize.mts';
import { lintWithOxlint } from '../../../adapters/oxlint/oxlint-runner.mts';
import { createProject } from '../../../adapters/oxlint/test-support/oxlint-project.mjs';
import { UNSAFE_ANY_RULES, untypedJavascriptConfig } from './untyped-javascript.mjs';
import { resolveHeadPolicy } from '../../head-policy.mjs';
import { resolveLayout } from '../../layout.mjs';

const PATTERNS = ['src/**/*.{ts,mjs}'];
const roots = [];

afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});
afterEach(() => vi.unstubAllEnvs());

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

  it('uses a nested config that enables checkJs inside an unchecked project', async () => {
    const root = project({ checkJs: false });
    mkdirSync(path.join(root, 'src/nested'));
    writeFileSync(path.join(root, 'src/nested/checked.mjs'), UNTYPED);
    writeFileSync(
      path.join(root, 'src/nested/tsconfig.json'),
      '{ "compilerOptions": { "checkJs": true, "noEmit": true } }',
    );

    const [fromEslint, fromOxlint] = await Promise.all([eslintFiles(root), oxlintFiles(root)]);

    expect(new Set(fromEslint)).toEqual(new Set(['src/unsafe.ts', 'src/nested/checked.mjs']));
    expect(new Set(fromOxlint)).toEqual(new Set(['src/unsafe.ts', 'src/nested/checked.mjs']));
  });

  it('respects a nested config that leaves JavaScript unchecked', async () => {
    const root = project({ checkJs: true });
    mkdirSync(path.join(root, 'src/nested'));
    writeFileSync(
      path.join(root, 'src/nested/tsconfig.json'),
      '{ "compilerOptions": { "checkJs": false, "noEmit": true } }',
    );
    writeFileSync(path.join(root, 'src/nested/plain.mjs'), UNTYPED);

    const [fromEslint, fromOxlint] = await Promise.all([eslintFiles(root), oxlintFiles(root)]);

    expect(new Set(fromEslint)).toEqual(new Set(['src/unsafe.ts', 'src/untyped.mjs']));
    expect(new Set(fromOxlint)).toEqual(new Set(['src/unsafe.ts', 'src/untyped.mjs']));
  });

  it.each([false, true])(
    'the default policy reads checkJs=%s from the analyzed project',
    async (checkJs) => {
      const root = project({ checkJs });
      const policyFile = path.join(root, 'head-policy.json');
      writeFileSync(policyFile, JSON.stringify(resolveHeadPolicy({}, root)));
      vi.stubEnv('NITPICKER_POLICY', policyFile);
      vi.stubEnv('NITPICKER_DIFF_ESLINT_PROJECT_ROOT', root);
      const configUrl = pathToFileURL(
        path.resolve(import.meta.dirname, '../../defaults/eslint.config.mjs'),
      );
      configUrl.search = `checkJs=${String(checkJs)}`;
      const { default: entries } = await import(configUrl.href);
      const eslint = new ESLint({ cwd: root, overrideConfigFile: true, overrideConfig: entries });
      const config = await eslint.calculateConfigForFile(path.join(root, 'src/untyped.mjs'));

      expect(config.rules['@typescript-eslint/no-unsafe-member-access'][0]).toBe(checkJs ? 2 : 0);
    },
  );
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

  it('follows a selected solution config to checked JavaScript in a referenced project', () => {
    const root = project({ checkJs: false });
    mkdirSync(path.join(root, 'config'));
    writeFileSync(
      path.join(root, 'config/solution.json'),
      '{ "files": [], "references": [{ "path": "./app.json" }] }',
    );
    writeFileSync(
      path.join(root, 'config/app.json'),
      '{ "compilerOptions": { "checkJs": true }, "include": ["../src"] }',
    );
    const [entry] = untypedJavascriptConfig({
      tsconfigFile: path.join(root, 'config/solution.json'),
      projectRoot: root,
      layout: { ...resolveLayout(), typescriptProject: 'config/solution.json' },
    });

    expect(entry.ignores).toEqual(['src/untyped.mjs']);
  });

  it('checks an imported JavaScript file outside the project include pattern', () => {
    const root = project({ checkJs: true });
    writeFileSync(
      path.join(root, 'tsconfig.json'),
      '{ "compilerOptions": { "checkJs": true }, "include": ["src/typed.ts"] }',
    );
    writeFileSync(path.join(root, 'src/typed.ts'), "import './untyped.mjs';\n");
    const [entry] = untypedJavascriptConfig({
      tsconfigFile: path.join(root, 'tsconfig.json'),
      layout: resolveLayout(),
    });

    expect(entry.ignores).toEqual(['src/untyped.mjs']);
  });

  it('leaves JavaScript outside the checked include pattern untyped', () => {
    const root = project({ checkJs: true });
    writeFileSync(
      path.join(root, 'tsconfig.json'),
      '{ "compilerOptions": { "checkJs": true }, "include": ["src/typed.ts"] }',
    );
    const [entry] = untypedJavascriptConfig({
      tsconfigFile: path.join(root, 'tsconfig.json'),
      layout: resolveLayout(),
    });

    expect(entry.ignores).toBeUndefined();
  });
});
