import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import tseslint from 'typescript-eslint';
import { afterAll, describe, expect, it } from 'vitest';
import { lintFixture } from '../../failure-messages/test-support/harness.mjs';
import { isNestProject, nestScopeConfigFor } from './nest-scope.mjs';

const roots = [];

afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

function projectWith(manifest) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-nest-scope-'));
  roots.push(root);
  writeFileSync(path.join(root, 'package.json'), JSON.stringify(manifest));
  return root;
}

const strictEmptyClass = {
  files: ['**/*.ts'],
  languageOptions: { parser: tseslint.parser },
  plugins: { '@typescript-eslint': tseslint.plugin },
  rules: { '@typescript-eslint/no-extraneous-class': 'error' },
};

function extraneousClassLines(config, code) {
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
});
