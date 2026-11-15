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
import {
  PACKAGE_ROOT,
  resolveTool as untypedResolveTool,
} from '../../../core/tooling/tool-resolution.mjs';
import { parseJson } from '../../../shared/values/readers.mts';
import { typescriptApi } from '../adapters/typed/typescript-program.mts';
import {
  apiResolution,
  hasJavaScriptApi,
  supportsRedirect,
  withRedirectPreload as untypedWithRedirectPreload,
} from './api-redirect.mjs';
import { selectTypeScriptApi } from './api-selection.mjs';

const resolveTool: (name: string) => { readonly root: string; readonly version: string } =
  untypedResolveTool;
const withRedirectPreload: (nodeOptions: string | undefined, apiRoot: string) => string =
  untypedWithRedirectPreload;

const require = createRequire(import.meta.url);
const bundledFile = require.resolve('typescript-js-api');
const bundledRoot = path.dirname(path.dirname(bundledFile));
const nativeRoot = resolveTool('@typescript/native').root;
const nativeMain = path.join(nativeRoot, 'lib/version.cjs');
const bundledVersion = resolveTool('typescript-js-api').version;

type Resolved = {
  readonly url: string;
  readonly format?: string;
  readonly shortCircuit?: true;
};
type NextResolve = (specifier: string, context?: object) => Resolved;

const apiResolutionHook: (
  apiRoot: string,
) => (
  specifier: string,
  context: { readonly parentURL?: string },
  nextResolve: NextResolve,
) => Resolved = apiResolution;

function notFound(code: string): Error {
  return Object.assign(new Error(code), { code });
}

function resolverOf(files: Readonly<Record<string, string>>): NodeJS.RequireResolve {
  function resolve(specifier: string): string {
    const found = files[specifier];
    if (found === undefined) throw notFound('MODULE_NOT_FOUND');
    return found;
  }
  return Object.assign(resolve, { paths: (): string[] => [] });
}

function supports(versions: { readonly node: string }, hooks: unknown): unknown {
  return Reflect.apply(supportsRedirect, undefined, [versions, hooks]);
}

describe('choosing the TypeScript API nitpicker reads source files with', () => {
  it('uses the installed typescript when it has a JavaScript API', () => {
    const installed = require.resolve('typescript');

    expect(selectTypeScriptApi(resolverOf({ typescript: installed }))).toEqual({
      file: installed,
      bundled: false,
    });
    expect(selectTypeScriptApi().bundled).toBe(false);
    expect(typescriptApi().createSourceFile).toBeTypeOf('function');
  });

  it('still reports the bundled API once the redirect sends typescript to it', () => {
    const resolve = resolverOf({ typescript: bundledFile, 'typescript-js-api': bundledFile });

    expect(selectTypeScriptApi(resolve, nativeRoot)).toEqual({ file: bundledFile, bundled: true });
  });

  it('reports an installed TypeScript 6 as installed when it shares its files with the bundled API', () => {
    const resolve = resolverOf({ typescript: bundledFile, 'typescript-js-api': bundledFile });

    expect(selectTypeScriptApi(resolve, bundledRoot)).toEqual({
      file: bundledFile,
      bundled: false,
    });
  });

  it('uses the bundled TypeScript 6 when the installed one is TypeScript 7', () => {
    const resolve = resolverOf({ typescript: nativeMain, 'typescript-js-api': bundledFile });

    expect(hasJavaScriptApi(nativeMain)).toBe(false);
    expect(selectTypeScriptApi(resolve, nativeRoot)).toEqual({ file: bundledFile, bundled: true });
  });

  it('uses the bundled TypeScript 6 when no typescript is installed', () => {
    expect(selectTypeScriptApi(resolverOf({ 'typescript-js-api': bundledFile }))).toEqual({
      file: bundledFile,
      bundled: true,
    });
  });
});

describe('the resolve hook for TypeScript 7 projects', () => {
  const resolve = apiResolutionHook(bundledRoot);
  function toNative(): Resolved {
    return { url: pathToFileURL(nativeMain).href };
  }
  const dependency = { parentURL: 'file:///project/node_modules/typescript-eslint/dist/index.js' };
  function redirected(file: string, format = 'commonjs'): Resolved {
    return {
      url: pathToFileURL(path.join(bundledRoot, file)).href,
      format,
      shortCircuit: true,
    };
  }

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
    function unexported(): never {
      throw notFound('ERR_PACKAGE_PATH_NOT_EXPORTED');
    }
    function missing(): never {
      throw notFound('ERR_MODULE_NOT_FOUND');
    }

    expect(resolve('typescript/lib/typescript.js', dependency, unexported)).toEqual(
      redirected('lib/typescript.js'),
    );
    expect(resolve('typescript', dependency, missing)).toEqual(redirected('lib/typescript.js'));
  });

  it("leaves the project's own code, a typescript with an API and other specifiers alone", () => {
    const native = { url: pathToFileURL(nativeMain).href };
    const installed = { url: pathToFileURL(require.resolve('typescript')).href };
    const other = { url: 'node:fs' };
    function broken(): never {
      throw notFound('ERR_INVALID_PACKAGE_CONFIG');
    }

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
    function hooks(): undefined {
      return undefined;
    }

    expect(supports({ node: '22.19.0' }, hooks)).toBe(true);
    expect(supports({ node: '24.1.0' }, hooks)).toBe(true);
    expect(supports({ node: '22.18.1' }, hooks)).toBe(false);
    expect(supports({ node: '20.19.0' }, hooks)).toBe(false);
    expect(supports({ node: '22.19.0' }, false)).toBe(false);
  });
});

describe('a Node process started with the preload in a TypeScript 7 project', () => {
  let project: string;
  let loaded: unknown;

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
    loaded = parseJson(output);
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
      own: resolveTool('@typescript/native').version,
    });
  });
});

describe('modules that load TypeScript', () => {
  it('go through the selected API instead of importing typescript directly', () => {
    const typeOnlyImport = /\bimport\s+type\b[^;]*;/gu;
    const direct = /(?:\bfrom\s+|\brequire\(\s*|\bimport\(\s*)['"]typescript(?:\/[^'"]*)?['"]/u;
    const sources = globSync('{core,languages,shared}/**/*.{mjs,cjs,js,mts}', {
      cwd: PACKAGE_ROOT,
      exclude: (name) => ['node_modules', 'fixtures', 'test-support'].includes(name),
    }).filter((file) => !(file.endsWith('.test.mjs') || file.endsWith('.test.mts')));

    expect(
      sources.filter((file) =>
        direct.test(
          readFileSync(path.join(PACKAGE_ROOT, file), 'utf8').replaceAll(typeOnlyImport, ''),
        ),
      ),
    ).toEqual([]);
  });
});
