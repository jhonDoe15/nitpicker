import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import nodeModule from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { findPackageJsonByWalking } from './package-json.mjs';
import { PACKAGE_ROOT } from './tool-resolution.mjs';

const nativeFindPackageJson = nodeModule.findPackageJSON;

function outcome(find, specifier, base) {
  try {
    return { found: find(specifier, base) };
  } catch (error) {
    return { code: error.code, message: error.message };
  }
}

function expectSameAsNative(specifier, base) {
  const walked = outcome(findPackageJsonByWalking, specifier, base);
  expect(walked).toEqual(outcome(nativeFindPackageJson, specifier, base));
  return walked;
}

function writeManifest(directory, manifest) {
  mkdirSync(directory, { recursive: true });
  writeFileSync(path.join(directory, 'package.json'), JSON.stringify(manifest));
}

describe('the findPackageJSON fallback for runtimes without node:module findPackageJSON', () => {
  const packageBase = pathToFileURL(path.join(PACKAGE_ROOT, 'package.json')).href;
  let linkedRoot;

  beforeAll(() => {
    linkedRoot = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-package-json-')));
    const store = path.join(linkedRoot, 'node_modules/.pnpm/@scope+linked@1.0.0/node_modules');
    writeManifest(path.join(store, '@scope/linked'), { name: '@scope/linked', version: '1.0.0' });
    writeManifest(path.join(store, 'nested'), { name: 'nested', version: '2.0.0' });
    mkdirSync(path.join(linkedRoot, 'node_modules/@scope'), { recursive: true });
    symlinkSync(
      path.join(store, '@scope/linked'),
      path.join(linkedRoot, 'node_modules/@scope/linked'),
      'dir',
    );
    writeManifest(path.join(linkedRoot, 'app'), {
      name: 'app',
      exports: './index.js',
    });
    writeManifest(path.join(linkedRoot, 'bare'), { name: 'bare' });
  });

  afterAll(() => {
    rmSync(linkedRoot, { recursive: true, force: true });
  });

  it.each([
    ['eslint'],
    ['eslint/package.json'],
    ['@stryker-mutator/core'],
    ['@stryker-mutator/core/package.json'],
    ['nitpicker'],
    ['./core/cli.mjs'],
    ['./core'],
  ])('finds the same package.json as the native API for %s', (specifier) => {
    expect(expectSameAsNative(specifier, packageBase).found).toMatch(/package\.json$/u);
  });

  it('reports a missing package with the native error code and message', () => {
    expect(expectSameAsNative('nitpicker-missing-package', packageBase).code).toBe(
      'ERR_MODULE_NOT_FOUND',
    );
  });

  it('accepts a path, a file URL object and a directory URL as the base', () => {
    expectSameAsNative('eslint', path.join(PACKAGE_ROOT, 'package.json'));
    expectSameAsNative('eslint', pathToFileURL(path.join(PACKAGE_ROOT, 'core/cli.mjs')));
    expectSameAsNative('eslint', pathToFileURL(path.join(PACKAGE_ROOT, 'core/')).href);
  });

  it('walks up from a package inside node_modules', () => {
    expectSameAsNative('espree', pathToFileURL(path.join(PACKAGE_ROOT, 'node_modules/eslint/x')));
  });

  it('returns the symlinked path of a linked scoped package, which resolves to the store', () => {
    const base = pathToFileURL(path.join(linkedRoot, 'app/package.json'));
    const { found } = expectSameAsNative('@scope/linked', base);

    expect(found).toBe(path.join(linkedRoot, 'node_modules/@scope/linked/package.json'));
    expect(realpathSync(path.dirname(found))).toBe(
      path.join(linkedRoot, 'node_modules/.pnpm/@scope+linked@1.0.0/node_modules/@scope/linked'),
    );
  });

  it('resolves a dependency of a linked package from the store, not from the project', () => {
    const linked = path.join(
      linkedRoot,
      'node_modules/.pnpm/@scope+linked@1.0.0/node_modules/@scope/linked/index.js',
    );
    expectSameAsNative('nested', pathToFileURL(linked));
    expect(outcome(findPackageJsonByWalking, 'nested', pathToFileURL(linkedRoot)).code).toBe(
      'ERR_MODULE_NOT_FOUND',
    );
  });

  it('resolves a package by its own name only when it declares exports', () => {
    expectSameAsNative('app', pathToFileURL(path.join(linkedRoot, 'app/index.js')));
    expectSameAsNative('bare', pathToFileURL(path.join(linkedRoot, 'bare/index.js')));
  });
});
