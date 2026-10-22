import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resolveTool } from '../../../core/tooling/tool-resolution.mjs';
import { apiResolution, hasJavaScriptApi, withRedirectPreload } from './api-redirect.mjs';
import { selectTypeScriptApi, TYPESCRIPT_API } from './api-selection.mjs';
import { ts } from './typescript-api.mjs';

const require = createRequire(import.meta.url);
const bundledFile = require.resolve('typescript-js-api');
const nativeRoot = resolveTool('typescript-native').root;
const nativeMain = path.join(nativeRoot, 'lib/version.cjs');
const bundledVersion = resolveTool('typescript-js-api').version;

function notFound(code) {
  return Object.assign(new Error(code), { code });
}

function resolverOf(files) {
  return (specifier) => {
    if (files[specifier] === undefined) throw notFound('MODULE_NOT_FOUND');
    return files[specifier];
  };
}

describe('choosing the TypeScript API nitpicker reads source files with', () => {
  it('uses the installed typescript when it has a JavaScript API', () => {
    const installed = require.resolve('typescript');

    expect(selectTypeScriptApi(resolverOf({ typescript: installed }))).toEqual({
      file: installed,
      bundled: false,
    });
    expect(TYPESCRIPT_API.bundled).toBe(false);
    expect(ts.createSourceFile).toBeTypeOf('function');
  });

  it('uses the bundled TypeScript 6 when the installed one is TypeScript 7', () => {
    const resolve = resolverOf({ typescript: nativeMain, 'typescript-js-api': bundledFile });

    expect(hasJavaScriptApi(nativeMain)).toBe(false);
    expect(selectTypeScriptApi(resolve)).toEqual({ file: bundledFile, bundled: true });
  });

  it('uses the bundled TypeScript 6 when no typescript is installed', () => {
    expect(selectTypeScriptApi(resolverOf({ 'typescript-js-api': bundledFile }))).toEqual({
      file: bundledFile,
      bundled: true,
    });
  });
});

describe('the resolve hook for TypeScript 7 projects', () => {
  const apiUrl = pathToFileURL(bundledFile).href;
  const resolve = apiResolution(apiUrl);
  const redirected = { url: apiUrl, format: 'commonjs', shortCircuit: true };

  it('redirects typescript to the bundled API when it resolves to a package without one', () => {
    const toNative = () => ({ url: pathToFileURL(nativeMain).href });

    expect(resolve('typescript', {}, toNative)).toEqual(redirected);
  });

  it('redirects the library path that TypeScript 7 does not export, and a missing package', () => {
    const unexported = () => {
      throw notFound('ERR_PACKAGE_PATH_NOT_EXPORTED');
    };
    const missing = () => {
      throw notFound('ERR_MODULE_NOT_FOUND');
    };

    expect(resolve('typescript/lib/typescript.js', {}, unexported)).toEqual(redirected);
    expect(resolve('typescript', {}, missing)).toEqual(redirected);
  });

  it('leaves a typescript with a JavaScript API, other specifiers and other errors alone', () => {
    const installed = { url: pathToFileURL(require.resolve('typescript')).href };
    const broken = () => {
      throw notFound('ERR_INVALID_PACKAGE_CONFIG');
    };

    expect(resolve('typescript', {}, () => installed)).toBe(installed);
    expect(resolve('typescript/package.json', {}, () => installed)).toBe(installed);
    expect(() => resolve('typescript', {}, broken)).toThrow('ERR_INVALID_PACKAGE_CONFIG');
  });

  it('adds the preload to NODE_OPTIONS once, after the options already set', () => {
    const once = withRedirectPreload('--max-old-space-size=4096', bundledFile);

    expect(once).toMatch(/^--max-old-space-size=4096 --import=data:text\/javascript,\S+$/u);
    expect(withRedirectPreload(once, bundledFile)).toBe(once);
    expect(withRedirectPreload(undefined, bundledFile)).toBe(once.split(' ')[1]);
  });
});

describe('a Node process started with the preload in a TypeScript 7 project', () => {
  let project;
  let loaded;

  beforeAll(() => {
    project = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker ts7 project-')));
    mkdirSync(path.join(project, 'node_modules'));
    symlinkSync(nativeRoot, path.join(project, 'node_modules/typescript'));
    writeFileSync(
      path.join(project, 'load.cjs'),
      "const ts = require('typescript');\n" +
        "const lib = require('typescript/lib/typescript.js');\n" +
        "const manifest = require('typescript/package.json');\n" +
        "import('typescript').then(({ default: esm }) => console.log(JSON.stringify({\n" +
        '  cjs: ts.version, lib: lib === ts, esm: esm === ts, parses: typeof ts.createSourceFile,\n' +
        '  installed: manifest.version,\n' +
        '})));\n',
    );
    const output = execFileSync(process.execPath, ['load.cjs'], {
      cwd: project,
      encoding: 'utf8',
      timeout: 30_000,
      env: { ...process.env, NODE_OPTIONS: withRedirectPreload(undefined, bundledFile) },
    });
    loaded = JSON.parse(output);
  });

  afterAll(() => {
    rmSync(project, { recursive: true, force: true });
  });

  it('gives require and import of typescript the bundled API, one module for both', () => {
    expect(loaded).toEqual({
      cjs: bundledVersion,
      lib: true,
      esm: true,
      parses: 'function',
      installed: resolveTool('typescript-native').version,
    });
  });
});
