import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { failureMessagesFor } from '../../failure-messages/test-support/harness.mjs';
import { resolveLayout } from '../../layout.mjs';
import { domProductionConfigFor, domTestedProductionFiles } from './dom-code.mjs';
import { hasDomDirectiveTests } from './dom-tests.mjs';

const roots = [];
const layout = resolveLayout({ sourceRoots: ['src'], testRoots: ['tests'] }, [], {
  javascript: true,
});
const jsdom = { environment: 'jsdom', scopes: [] };
const RENDER = "export function render() { document.title = 'a'; }\n";
const SERVER = 'export function serve() { return document.title; }\n';
const DOM_TEST = "import { render } from '../src/ui/render.js';\nit('a', () => render());\n";

afterAll(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function projectWith(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-dom-code-'));
  roots.push(root);
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), text);
  }
  return root;
}

const browserProject = {
  'src/ui/render.js':
    "import { label } from './label.js';\nexport function render() { label(); }\n",
  'src/ui/label.js': RENDER.replace('render', 'label'),
  'src/server/serve.js': SERVER,
  'tests/render.test.js': DOM_TEST,
};

function productionMessages(root, environments, filename, code) {
  const config = [
    { rules: { 'no-undef': 'error' } },
    ...domProductionConfigFor(layout, environments, root),
  ];
  return failureMessagesFor({ config, filename, code });
}

function directive(runner, environment) {
  return `/** @${runner}-environment ${environment} */\n`;
}

describe('the browser globals of production code in a DOM-tested project', () => {
  it('covers the production files the DOM tests import, directly or through other files', () => {
    expect(domTestedProductionFiles(layout, jsdom, projectWith(browserProject))).toEqual([
      'src/ui/render.js',
      'src/ui/label.js',
    ]);
  });

  it('lets that code use the browser globals and still flags them in Node-only code', () => {
    const root = projectWith(browserProject);

    expect(productionMessages(root, jsdom, 'src/ui/label.js', RENDER)).toEqual([]);
    expect(productionMessages(root, jsdom, 'src/server/serve.js', SERVER)).toEqual([
      "'document' is not defined.",
    ]);
  });

  it('follows only the tests a DOM scope or a DOM directive puts in the DOM', () => {
    const scoped = {
      environment: 'node',
      scopes: [{ files: ['tests/ui/**/*.test.js'], ignores: [], environment: 'happy-dom' }],
    };
    const files = {
      'src/ui/render.js': RENDER,
      'src/server/serve.js': SERVER,
      'src/cli/run.js': SERVER,
      'tests/ui/render.test.js': DOM_TEST.replace('../src', '../../src'),
      'tests/serve.test.js': "import '../src/server/serve.js';\nit('a', () => {});\n",
      'tests/run.test.js': `${directive('jest', 'jsdom')}import '../src/cli/run.js';\n`,
    };

    expect(domTestedProductionFiles(layout, scoped, projectWith(files))).toEqual([
      'src/cli/run.js',
      'src/ui/render.js',
    ]);
  });

  it('gives no production code the browser globals when no test runs in a DOM', () => {
    const root = projectWith(browserProject);

    expect(domProductionConfigFor(layout, { environment: 'node', scopes: [] }, root)).toEqual([]);
    expect(
      productionMessages(root, { environment: 'node', scopes: [] }, 'src/ui/label.js', RENDER),
    ).toEqual(["'document' is not defined."]);
  });

  it('restricts the confusing browser globals outside domain/', () => {
    const root = projectWith({
      ...browserProject,
      'src/main/features/a/domain/b.js': 'export const value = 1;\n',
      'tests/b.test.js': "import '../src/main/features/a/domain/b.js';\n",
    });

    expect(
      productionMessages(root, jsdom, 'src/ui/label.js', 'export const value = name;'),
    ).toEqual([
      "Unexpected use of 'name'. `name` here is the browser global, not a local value. Write `window.name` when you mean the global; otherwise take the value as a parameter (`onClick={(event) => ...}`) or declare it.",
    ]);
    expect(
      productionMessages(
        root,
        jsdom,
        'src/main/features/a/domain/b.js',
        'export const value = name;',
      ),
    ).toEqual([]);
  });
});

describe('DOM environment directives in test files', () => {
  it('finds a test file that asks for a DOM environment in its docblock', () => {
    expect(
      hasDomDirectiveTests(
        layout,
        projectWith({ 'tests/a.test.js': directive('vitest', 'happy-dom') }),
      ),
    ).toBe(true);
    expect(
      hasDomDirectiveTests(layout, projectWith({ 'tests/a.test.js': "it('a', () => {});\n" })),
    ).toBe(false);
  });
});
