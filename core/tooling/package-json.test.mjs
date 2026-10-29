import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import nodeModule from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  findPackageJSON,
  findPackageJsonByWalking,
  selectFindPackageJson,
} from './package-json.mjs';
import { PACKAGE_ROOT } from './tool-resolution.mjs';

const nativeFindPackageJson = nodeModule.findPackageJSON;

function outcome(find, specifier, base) {
  try {
    return { found: find(specifier, base) };
  } catch (error) {
    return { code: error.code, message: error.message };
  }
}

function bothOutcomes(specifier, base) {
  return {
    walked: outcome(findPackageJsonByWalking, specifier, base),
    native: outcome(nativeFindPackageJson, specifier, base),
  };
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
    mkdirSync(path.join(linkedRoot, 'broken'));
    writeFileSync(path.join(linkedRoot, 'broken/package.json'), '{not json');
    writeFileSync(path.join(linkedRoot, 'broken/index.js'), '');
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
    const { walked, native } = bothOutcomes(specifier, packageBase);

    expect(walked).toEqual(native);
    expect(path.basename(walked.found)).toBe('package.json');
  });

  it('reports a missing package with the native error code and message', () => {
    const { walked, native } = bothOutcomes('nitpicker-missing-package', packageBase);

    expect(walked).toEqual(native);
    expect(walked.code).toBe('ERR_MODULE_NOT_FOUND');
  });

  it('accepts a path, a file URL object and a directory URL as the base', () => {
    const bases = [
      path.join(PACKAGE_ROOT, 'package.json'),
      pathToFileURL(path.join(PACKAGE_ROOT, 'core/cli.mjs')),
      pathToFileURL(path.join(PACKAGE_ROOT, 'core/')).href,
    ];
    const results = bases.map((base) => bothOutcomes('eslint', base));

    expect(results.map(({ walked }) => walked)).toEqual(results.map(({ native }) => native));
  });

  it('walks up from a package inside node_modules', () => {
    const base = pathToFileURL(path.join(PACKAGE_ROOT, 'node_modules/eslint/x'));
    const { walked, native } = bothOutcomes('espree', base);

    expect(walked).toEqual(native);
  });

  it('returns the symlinked path of a linked scoped package, which resolves to the store', () => {
    const base = pathToFileURL(path.join(linkedRoot, 'app/package.json'));
    const { walked, native } = bothOutcomes('@scope/linked', base);
    const { found } = walked;

    expect(walked).toEqual(native);
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
    const { walked, native } = bothOutcomes('nested', pathToFileURL(linked));

    expect(walked).toEqual(native);
    expect(outcome(findPackageJsonByWalking, 'nested', pathToFileURL(linkedRoot)).code).toBe(
      'ERR_MODULE_NOT_FOUND',
    );
  });

  it('resolves a package by its own name only when it declares exports', () => {
    const app = bothOutcomes('app', pathToFileURL(path.join(linkedRoot, 'app/index.js')));
    const bare = bothOutcomes('bare', pathToFileURL(path.join(linkedRoot, 'bare/index.js')));

    expect(app.walked).toEqual(app.native);
    expect(app.walked.found).toBe(path.join(linkedRoot, 'app/package.json'));
    expect(bare.walked).toEqual(bare.native);
    expect(bare.walked.code).toBe('ERR_MODULE_NOT_FOUND');
  });

  it.each([
    ['a relative specifier to a missing file', './core/missing-module.mjs'],
    ['a parent directory', '..'],
    ['the base directory', '.'],
    ['an absolute path that does not exist', '/nitpicker-missing/module.mjs'],
    ['a scope without a package name', '@scope'],
    ['a name that starts with a dot', '.hidden-package/x'],
  ])('gives the native result or error for %s', (_case, specifier) => {
    const { walked, native } = bothOutcomes(specifier, packageBase);

    expect(walked).toEqual(native);
  });

  it('reports an empty specifier as a missing module, as the native API does', () => {
    const { walked, native } = bothOutcomes('', packageBase);

    expect([walked.code, native.code]).toEqual(['ERR_MODULE_NOT_FOUND', 'ERR_MODULE_NOT_FOUND']);
  });

  it('reports a malformed package.json in scope as an invalid package config', () => {
    const base = pathToFileURL(path.join(linkedRoot, 'broken/index.js'));
    const results = ['broken', './index.js'].map((specifier) => bothOutcomes(specifier, base));

    expect(results.map(({ walked }) => walked)).toEqual(results.map(({ native }) => native));
    expect(results.map(({ walked }) => walked.code)).toEqual([
      'ERR_INVALID_PACKAGE_CONFIG',
      'ERR_INVALID_PACKAGE_CONFIG',
    ]);
  });
});

describe('choosing the findPackageJSON implementation', () => {
  it('uses the native API where node:module has it', () => {
    expect(findPackageJSON).toBe(nativeFindPackageJson);
  });

  it('falls back to the walk on a runtime whose node:module lacks findPackageJSON', () => {
    const withoutIt = Object.fromEntries(
      Object.entries(nodeModule).filter(([name]) => name !== 'findPackageJSON'),
    );

    expect(selectFindPackageJson(withoutIt)).toBe(findPackageJsonByWalking);
  });
});
