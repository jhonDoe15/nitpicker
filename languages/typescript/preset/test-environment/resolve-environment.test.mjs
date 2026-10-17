import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  LINT_CONFIG,
  loadTestEnvironments,
  testEnvironmentNotices,
  testEnvironmentsFor,
} from './resolve-environment.mjs';

const repositoryModules = path.join(import.meta.dirname, '../../../../node_modules');
const roots = [];

afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

function projectWith(files, { vite = 'real', packages = [] } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-resolve-environment-'));
  roots.push(root);
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), text);
  }
  const linked = vite === 'real' ? ['vite', ...packages] : packages;
  for (const name of linked) {
    mkdirSync(path.join(root, 'node_modules'), { recursive: true });
    symlinkSync(path.join(repositoryModules, name), path.join(root, 'node_modules', name), 'dir');
  }
  return root;
}

function noticePattern(reason) {
  const escaped = reason.replaceAll(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  return new RegExp(
    `^The project's test config vitest\\.config\\.mjs could not be read \\(.*${escaped}.*\\), so the DOM-environment check only uses per-file directives\\.$`,
    'u',
  );
}

const configWith = (text) => ({ 'vitest.config.mjs': text });
const jsdomConfig = 'export default { test: { environment: "jsdom" } };';
const fakeVite = (environment) => ({
  'node_modules/vite/package.json': JSON.stringify({
    name: 'vite',
    exports: { '.': { import: { default: './index.js' } } },
  }),
  'node_modules/vite/index.js': `export async function loadConfigFromFile() { return { config: { test: { environment: ${JSON.stringify(environment)} } } }; }\n`,
});

describe('loadTestEnvironments', () => {
  it('is node, without starting a process, when the project has no vitest or vite config', () => {
    const root = projectWith({}, { vite: 'none' });
    expect(loadTestEnvironments({ projectRoot: root })).toEqual({
      environment: 'node',
      scopes: [],
    });
  });

  it.each([
    ['a plain config', jsdomConfig, 'jsdom'],
    [
      'a function config',
      'export default () => ({ test: { environment: "happy-dom" } });',
      'happy-dom',
    ],
    ['a config without test options', 'export default Promise.resolve({ test: {} });', 'node'],
    [
      'a config that logs and warns',
      'console.log("loading"); console.warn("careful"); process.stdout.write("{\\"junk\\":1}\\n"); export default { test: { environment: "jsdom" } };',
      'jsdom',
    ],
  ])('reads %s', (_name, text) => {
    const root = projectWith(configWith(text));
    expect(loadTestEnvironments({ projectRoot: root }).environment).toBe(
      /environment: "([\w-]+)"/u.exec(text)?.[1] ?? 'node',
    );
  });

  it.each([
    ['throws', 'throw new Error("broken config");', 'broken config'],
    [
      'imports a missing plugin',
      'import "@acme/missing-plugin"; export default {};',
      'missing-plugin',
    ],
    ['exits the process', 'process.exit(3);', 'the config ended the process with exit code 3'],
  ])('reports a clear notice, not a crash, for a config that %s', (_name, text, reason) => {
    const root = projectWith(configWith(text));
    const result = loadTestEnvironments({ projectRoot: root });
    expect(result.environment).toBeUndefined();
    expect(result.scopes).toEqual([]);
    expect(result.notice.path).toBe('vitest.config.mjs');
    expect(result.notice.message).toMatch(noticePattern(reason));
  });

  it('passes the bundler aliases on to the rule', () => {
    const root = projectWith(
      configWith(
        'export default { resolve: { alias: { "@": "/src" } }, test: { environment: "jsdom", alias: [{ find: /^~(.*)$/u, replacement: "./lib$1" }] } };',
      ),
    );
    mkdirSync(path.join(root, 'src'));
    expect(loadTestEnvironments({ projectRoot: root }).aliases).toEqual([
      { find: '@', replacement: path.join(root, 'src') },
      { find: { pattern: '^~(.*)$', flags: 'u' }, replacement: path.join(root, 'lib$1') },
    ]);
  });

  it('gives up on a config that never settles', () => {
    const root = projectWith(
      configWith(
        'setInterval(() => undefined, 1000); export default new Promise(() => undefined);',
      ),
    );
    const result = loadTestEnvironments({ projectRoot: root, timeoutMs: 2000 });
    expect(result.notice.message).toBe(
      "The project's test config vitest.config.mjs could not be read (it did not finish within 2000 ms), so the DOM-environment check only uses per-file directives.",
    );
  });

  it("loads vite from the analyzed project, not from nitpicker's install", () => {
    const root = projectWith({ ...configWith(''), ...fakeVite('happy-dom') }, { vite: 'none' });
    expect(loadTestEnvironments({ projectRoot: root })).toEqual({
      environment: 'happy-dom',
      scopes: [],
      aliases: [],
    });
  });

  it('falls back to the live project when the snapshot has no vite', () => {
    const snapshot = projectWith(configWith(''), { vite: 'none' });
    const live = projectWith(fakeVite('jsdom'), { vite: 'none' });
    expect(loadTestEnvironments({ projectRoot: snapshot, liveProjectRoot: live }).environment).toBe(
      'jsdom',
    );
  });

  it('says so when the project has no vite at all', () => {
    const root = projectWith(configWith(jsdomConfig), { vite: 'none' });
    expect(loadTestEnvironments({ projectRoot: root }).notice.message).toMatch(
      noticePattern('vite could not be resolved from the project'),
    );
  });
});

describe('loadTestEnvironments for the runners that register a DOM globally', () => {
  const nodeCommand = (nodeArguments) => ({
    environment: {},
    nodeArguments,
    arguments_: ['test/'],
  });

  it("reads Mocha's require from the .mocharc file", () => {
    const root = projectWith(
      { '.mocharc.json': JSON.stringify({ require: ['global-jsdom/register'] }) },
      { vite: 'none', packages: ['mocha'] },
    );

    expect(loadTestEnvironments({ projectRoot: root, runner: 'mocha' })).toEqual({
      environment: 'jsdom',
      scopes: [],
      setupFiles: ['global-jsdom/register'],
      globalDom: 'global-jsdom/register',
    });
  });

  it("reads Mocha's require from the test script, through a local setup file", () => {
    const root = projectWith(
      { 'test/dom.cjs': "require('jsdom-global/register');\n" },
      { vite: 'none', packages: ['mocha'] },
    );
    const command = { environment: {}, nodeArguments: [], arguments_: ['-r', './test/dom.cjs'] };

    expect(loadTestEnvironments({ projectRoot: root, runner: 'mocha', command })).toEqual({
      environment: 'jsdom',
      scopes: [],
      setupFiles: [path.join(root, 'test/dom.cjs')],
      globalDom: './test/dom.cjs',
    });
  });

  it("reads node's --import and --require flags", () => {
    const root = projectWith({}, { vite: 'none' });
    const load = (nodeArguments) =>
      loadTestEnvironments({
        projectRoot: root,
        runner: 'node',
        command: nodeCommand(nodeArguments),
      });

    expect(load(['--import', 'global-jsdom/register'])).toEqual({
      environment: 'jsdom',
      scopes: [],
      setupFiles: ['global-jsdom/register'],
      globalDom: 'global-jsdom/register',
    });
    expect(load(['--import', 'tsx'])).toEqual({ environment: 'node', scopes: [] });
  });
});

describe('testEnvironmentsFor', () => {
  const testFiles = { 'src/a.test.ts': 'export {};\n' };
  const select = (root, configRelativePath = LINT_CONFIG) =>
    testEnvironmentsFor({ projectRoot: root, liveProjectRoot: root, configRelativePath });

  it('loads the config for the default lint config when a runnable test file exists', () => {
    expect(select(projectWith({ ...configWith(jsdomConfig), ...testFiles })).environment).toBe(
      'jsdom',
    );
  });

  it('does not load the config for another analyzer or when no test file is linted', () => {
    const withConfig = projectWith({ ...configWith(jsdomConfig), ...testFiles });
    const withoutTests = projectWith({ ...configWith(jsdomConfig), 'src/a.ts': 'export {};\n' });
    expect(
      select(withConfig, 'languages/typescript/preset/eslint-config/policies/errors.config.mjs'),
    ).toEqual({
      environment: undefined,
      scopes: [],
    });
    expect(select(withoutTests)).toEqual({ environment: undefined, scopes: [] });
  });
});

describe('testEnvironmentNotices', () => {
  it('turns an unreadable config into one report-only finding on the config file', () => {
    const notice = { path: 'vitest.config.mjs', message: 'The project config could not be read.' };
    expect(
      testEnvironmentNotices({ testEnvironments: { notice }, analyzerName: 'eslint-lint' }),
    ).toEqual([
      {
        tool: 'eslint-lint',
        rule: 'nitpicker/no-unused-dom-environment',
        path: 'vitest.config.mjs',
        identity: 'test-config-unreadable',
        message: 'The project config could not be read.',
        classification: 'descriptive',
      },
    ]);
    expect(testEnvironmentNotices({ testEnvironments: {}, analyzerName: 'eslint-lint' })).toEqual(
      [],
    );
  });
});
