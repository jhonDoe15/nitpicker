import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { globalDomEnvironments, nodeSetupEntries, registeredEnvironment } from './global-dom.mjs';

const roots = [];

afterAll(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function projectWith(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-global-dom-'));
  roots.push(root);
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), text);
  }
  return root;
}

describe('the DOM registrars', () => {
  it.each([
    ['global-jsdom/register', 'jsdom'],
    ['global-jsdom', 'jsdom'],
    ['jsdom-global/register', 'jsdom'],
    ['@happy-dom/global-registrator', 'happy-dom'],
    ['jsdom', undefined],
    ['tsx', undefined],
  ])('reads %s as %s', (specifier, environment) => {
    expect(registeredEnvironment(specifier)).toBe(environment);
  });
});

describe('globalDomEnvironments', () => {
  it('is node when no setup entry registers a DOM', () => {
    const root = projectWith({ 'test/setup.js': "import 'source-map-support/register';\n" });

    expect(globalDomEnvironments(root, ['ts-node/register', './test/setup.js'])).toEqual({
      environment: 'node',
      scopes: [],
    });
  });

  it('is the registered DOM, with every setup entry, when a package registers it', () => {
    const root = projectWith({ 'test/setup.js': 'export {};\n' });

    expect(globalDomEnvironments(root, ['global-jsdom/register', 'test/setup.js'])).toEqual({
      environment: 'jsdom',
      scopes: [],
      setupFiles: ['global-jsdom/register', path.join(root, 'test/setup.js')],
      globalDom: 'global-jsdom/register',
    });
  });

  it('reads a local setup file that registers happy-dom', () => {
    const root = projectWith({
      'test/dom.mjs': [
        "import { GlobalRegistrator } from '@happy-dom/global-registrator';",
        'GlobalRegistrator.register();',
        '',
      ].join('\n'),
    });

    expect(globalDomEnvironments(root, ['./test/dom.mjs'])).toEqual({
      environment: 'happy-dom',
      scopes: [],
      setupFiles: [path.join(root, 'test/dom.mjs')],
      globalDom: './test/dom.mjs',
    });
  });

  it('does not read a setup file outside the project', () => {
    const root = projectWith({});

    expect(globalDomEnvironments(root, ['../outside.js'])).toEqual({
      environment: 'node',
      scopes: [],
    });
  });
});

describe('nodeSetupEntries', () => {
  it('collects --import and --require from the node flags, the test arguments and NODE_OPTIONS', () => {
    const command = {
      environment: { NODE_OPTIONS: '--require ./a.cjs --max-old-space-size=4096' },
      nodeArguments: ['--import', 'tsx', '--import=global-jsdom/register'],
      arguments_: ['-r', './b.cjs', '--test-reporter', 'spec', 'test/'],
    };

    expect(nodeSetupEntries(command)).toEqual([
      './a.cjs',
      'tsx',
      'global-jsdom/register',
      './b.cjs',
    ]);
  });
});
