import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import tseslint from 'typescript-eslint';
import { ESLint } from 'eslint';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { frameworkConventions } from '../scope-support.mjs';
import { nestClassMessage } from './nest-forms.mjs';
import { isNestProject, nestEntryPoints } from './nest-project.mjs';
import { fieldOf, listOf, objectOf, textOf } from '../../../../../shared/values/readers.mts';
import { linterConfigs } from '../typed/config-types.mts';
import { lintFixture } from '../typed/lint-fixture.mts';
import { nestScopeConfigFor } from './nest-scope.mts';
import { checkoutModulePath as untypedCheckoutModulePath } from '../../../../../shared/paths/checkout-module.mjs';

const checkoutModulePath: (file: string) => string = untypedCheckoutModulePath;

const roots: string[] = [];

afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

const defaultsDirectory = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../defaults');

async function presetRulesFor(manifest: object, file: string): Promise<unknown> {
  const root = projectWith(manifest);
  vi.stubEnv('NITPICKER_DIFF_ESLINT_PROJECT_ROOT', root);
  const configUrl = pathToFileURL(
    checkoutModulePath(path.join(defaultsDirectory, 'eslint.config.mjs')),
  );
  const module: unknown = await import(`${configUrl.href}?nest=${encodeURIComponent(root)}`);
  const eslint = new ESLint({
    cwd: defaultsDirectory,
    overrideConfigFile: true,
    overrideConfig: linterConfigs(
      listOf(fieldOf(module, 'default')).flatMap((entry) => objectOf(entry) ?? []),
    ),
  });
  return fieldOf(await eslint.calculateConfigForFile(file), 'rules');
}

function projectWith(manifest: object, files: Readonly<Record<string, string>> = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-nest-scope-'));
  roots.push(root);
  writeFileSync(path.join(root, 'package.json'), JSON.stringify(manifest));
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), text);
  }
  return root;
}

const NEST = { dependencies: { '@nestjs/core': '^11.0.0' } };
const BOOTSTRAP = 'void bootstrap();\n';

const strictEmptyClass = {
  files: ['**/*.ts'],
  languageOptions: { parser: tseslint.parser },
  plugins: { '@typescript-eslint': tseslint.plugin },
  rules: { '@typescript-eslint/no-extraneous-class': 'error' },
};

function extraneousClassLines(config: readonly object[], code: string) {
  return lintFixture({ config, filename: 'src/cats.module.ts', code })
    .filter(({ ruleId }) => ruleId === '@typescript-eslint/no-extraneous-class')
    .map(({ line }) => line);
}

describe('NestJS scope', () => {
  it.each([
    [{ dependencies: { '@nestjs/core': '^11.0.0' } }, true],
    [{ peerDependencies: { '@nestjs/core': '^11.0.0' } }, true],
    [{ devDependencies: { '@nestjs/core': '^11.0.0' } }, false],
    [{ dependencies: { '@nestjs/common': '^11.0.0' } }, false],
    [{ dependencies: { express: '^5.0.0' } }, false],
    [{}, false],
  ])('treats %j as a NestJS project: %s', (manifest, expected) => {
    expect(isNestProject(projectWith(manifest))).toBe(expected);
  });

  it('allows an empty decorated module class and still reports an undecorated one', () => {
    const code = '@Module({})\nexport class CatsModule {}\nexport class Empty {}\n';
    const nestConfig = [strictEmptyClass, ...nestScopeConfigFor(['**/*.ts'])];

    expect(extraneousClassLines([strictEmptyClass], code)).toEqual([2, 3]);
    expect(extraneousClassLines(nestConfig, code)).toEqual([3]);
  });

  it('takes src/main.ts as the entry point by default', () => {
    expect(nestEntryPoints(projectWith(NEST, { 'src/main.ts': BOOTSTRAP }))).toEqual([
      'src/main.ts',
    ]);
  });

  it('reads the entry from nest-cli.json', () => {
    const root = projectWith(NEST, {
      'nest-cli.json':
        '{ // comments are allowed\n "sourceRoot": "apps/api", "entryFile": "server" }',
      'apps/api/server.ts': BOOTSTRAP,
      'src/main.ts': BOOTSTRAP,
    });

    expect(nestEntryPoints(root)).toEqual(['apps/api/server.ts']);
  });

  it('names no entry point without NestJS or without the entry file', () => {
    expect(nestEntryPoints(projectWith({}, { 'src/main.ts': BOOTSTRAP }))).toEqual([]);
    expect(nestEntryPoints(projectWith(NEST))).toEqual([]);
  });

  it('reads the entry of every project of a monorepo', () => {
    const root = projectWith(NEST, {
      'nest-cli.json': JSON.stringify({
        monorepo: true,
        sourceRoot: 'apps/api/src',
        projects: { api: { sourceRoot: 'apps/api/src' }, web: { sourceRoot: 'apps/web/src' } },
      }),
      'apps/api/src/main.ts': BOOTSTRAP,
      'apps/web/src/main.ts': BOOTSTRAP,
    });

    expect(nestEntryPoints(root)).toEqual(['apps/api/src/main.ts', 'apps/web/src/main.ts']);
  });

  it('ignores an entry outside the project', () => {
    const root = projectWith(NEST, { 'nest-cli.json': '{ "sourceRoot": "../elsewhere" }' });

    expect(nestEntryPoints(root)).toEqual([]);
  });

  it('adds the NestJS entry to the framework entry points', () => {
    const root = projectWith(NEST, { 'src/main.ts': BOOTSTRAP });

    expect(frameworkConventions(root).entryPoints).toEqual(['src/main.ts']);
  });
});

describe('the preset config with NestJS', () => {
  const ADAPTER = 'src/main/features/cats/adapters/cats.ts';

  function classMessages(rules: unknown) {
    return listOf(fieldOf(rules, 'no-restricted-syntax'))
      .slice(1)
      .map((entry) => textOf(fieldOf(entry, 'message')));
  }

  it('turns on the NestJS forms and the empty decorated class', async () => {
    const rules = await presetRulesFor(NEST, ADAPTER);

    expect(classMessages(rules)).toContain(nestClassMessage);
    expect(fieldOf(rules, '@typescript-eslint/no-extraneous-class')).toEqual([
      2,
      { allowWithDecorator: true },
    ]);
  });

  it('keeps them off without NestJS', async () => {
    const rules = await presetRulesFor({ dependencies: { express: '^5.0.0' } }, ADAPTER);

    expect(classMessages(rules)).not.toContain(nestClassMessage);
    expect(fieldOf(rules, '@typescript-eslint/no-extraneous-class')).toEqual([2]);
  });
});
