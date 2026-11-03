import { execFileSync } from 'node:child_process';
import {
  globSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PACKAGE_ROOT, resolveTool } from '../../../core/tooling/tool-resolution.mjs';
import {
  apiResolution,
  hasJavaScriptApi,
  supportsRedirect,
  withRedirectPreload,
} from './api-redirect.mjs';
import { selectTypeScriptApi, TYPESCRIPT_API } from './api-selection.mjs';
import { ts } from './typescript-api.mjs';

const require = createRequire(import.meta.url);
const bundledFile = require.resolve('typescript-js-api');
const bundledRoot = path.dirname(path.dirname(bundledFile));
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
  const resolve = apiResolution(bundledRoot);
  const toNative = () => ({ url: pathToFileURL(nativeMain).href });
  const dependency = { parentURL: 'file:///project/node_modules/typescript-eslint/dist/index.js' };
  const redirected = (file, format = 'commonjs') => ({
    url: pathToFileURL(path.join(bundledRoot, file)).href,
    format,
    shortCircuit: true,
  });

  it('redirects typescript, its manifest and its libraries for a package without an API', () => {
    expect(resolve('typescript', dependency, toNative)).toEqual(redirected('lib/typescript.js'));
    expect(resolve('typescript/package.json', dependency, toNative)).toEqual(
      redirected('package.json', 'json'),
    );
    expect(resolve('typescript/lib/tsserverlibrary', dependency, toNative)).toEqual(
      redirected('lib/tsserverlibrary.js'),
    );
  });

  it('redirects the library path that TypeScript 7 does not export, and a missing package', () => {
    const unexported = () => {
      throw notFound('ERR_PACKAGE_PATH_NOT_EXPORTED');
    };
    const missing = () => {
      throw notFound('ERR_MODULE_NOT_FOUND');
    };

    expect(resolve('typescript/lib/typescript.js', dependency, unexported)).toEqual(
      redirected('lib/typescript.js'),
    );
    expect(resolve('typescript', dependency, missing)).toEqual(redirected('lib/typescript.js'));
  });

  it("leaves the project's own code, a typescript with an API and other specifiers alone", () => {
    const native = { url: pathToFileURL(nativeMain).href };
    const installed = { url: pathToFileURL(require.resolve('typescript')).href };
    const other = { url: 'node:fs' };
    const broken = () => {
      throw notFound('ERR_INVALID_PACKAGE_CONFIG');
    };

    expect(
      resolve('typescript', { parentURL: 'file:///project/test/a.test.js' }, () => native),
    ).toBe(native);
    expect(resolve('typescript', {}, () => native)).toBe(native);
    expect(resolve('typescript', dependency, () => installed)).toBe(installed);
    expect(resolve('typescript/package.json', dependency, () => installed)).toBe(installed);
    expect(resolve('typescript-eslint', dependency, () => other)).toBe(other);
    expect(() => resolve('typescript', dependency, broken)).toThrow('ERR_INVALID_PACKAGE_CONFIG');
  });

  it('adds the preload to NODE_OPTIONS once, after the options already set', () => {
    const once = withRedirectPreload('--max-old-space-size=4096', bundledRoot);

    expect(once).toMatch(/^--max-old-space-size=4096 --import=data:text\/javascript,\S+$/u);
    expect(withRedirectPreload(once, bundledRoot)).toBe(once);
    expect(withRedirectPreload(undefined, bundledRoot)).toBe(once.split(' ')[1]);
  });

  it('needs Node.js 22.19 or newer with module.registerHooks', () => {
    const hooks = () => undefined;

    expect(supportsRedirect({ node: '22.19.0' }, hooks)).toBe(true);
    expect(supportsRedirect({ node: '24.1.0' }, hooks)).toBe(true);
    expect(supportsRedirect({ node: '22.18.1' }, hooks)).toBe(false);
    expect(supportsRedirect({ node: '20.19.0' }, hooks)).toBe(false);
    expect(supportsRedirect({ node: '22.19.0' }, null)).toBe(false);
  });
});

describe('a Node process started with the preload in a TypeScript 7 project', () => {
  let project;
  let loaded;

  beforeAll(() => {
    project = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker ts7 project-')));
    mkdirSync(path.join(project, 'node_modules'));
    symlinkSync(nativeRoot, path.join(project, 'node_modules/typescript'));
    mkdirSync(path.join(project, 'node_modules/probe'));
    writeFileSync(path.join(project, 'node_modules/probe/package.json'), '{"name":"probe"}');
    writeFileSync(
      path.join(project, 'node_modules/probe/index.js'),
      "const ts = require('typescript');\n" +
        "const lib = require('typescript/lib/typescript.js');\n" +
        "const manifest = require('typescript/package.json');\n" +
        "const server = require('typescript/lib/tsserverlibrary.js');\n" +
        "module.exports = import('typescript').then(({ default: esm }) => ({\n" +
        '  cjs: ts.version, lib: lib === ts, esm: esm === ts, parses: typeof ts.createSourceFile,\n' +
        '  manifest: manifest.version, server: typeof server.server,\n' +
        '}));\n',
    );
    writeFileSync(
      path.join(project, 'load.cjs'),
      "const own = require('typescript/package.json').version;\n" +
        "require('probe').then((probe) => console.log(JSON.stringify({ ...probe, own })));\n",
    );
    const output = execFileSync(process.execPath, ['load.cjs'], {
      cwd: project,
      encoding: 'utf8',
      timeout: 30_000,
      env: { ...process.env, NODE_OPTIONS: withRedirectPreload(undefined, bundledRoot) },
    });
    loaded = JSON.parse(output);
  });

  afterAll(() => {
    rmSync(project, { recursive: true, force: true });
  });

  it('gives packages the bundled API and leaves the project its own typescript', () => {
    expect(loaded).toEqual({
      cjs: bundledVersion,
      lib: true,
      esm: true,
      parses: 'function',
      manifest: bundledVersion,
      server: 'object',
      own: resolveTool('typescript-native').version,
    });
  });
});

describe('modules that load TypeScript', () => {
  it('go through the selected API instead of importing typescript directly', () => {
    const direct = /(?:\bfrom\s+|\brequire\(\s*|\bimport\(\s*)['"]typescript(?:\/[^'"]*)?['"]/u;
    const sources = globSync('{core,languages,shared}/**/*.{mjs,cjs,js}', {
      cwd: PACKAGE_ROOT,
      exclude: (name) => ['node_modules', 'fixtures', 'test-support'].includes(name),
    }).filter((file) => !file.endsWith('.test.mjs'));

    expect(
      sources.filter((file) => direct.test(readFileSync(path.join(PACKAGE_ROOT, file), 'utf8'))),
    ).toEqual([]);
  });
});
