import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import { afterAll, afterEach, beforeAll, beforeEach, describe, it } from 'vitest';
import { rule } from '../rules/testing/environment/no-unused-dom-environment.mjs';
import { createProject, docblock, lines, logic } from './test-support/environment-project.mjs';

RuleTester.afterAll = afterAll;
RuleTester.afterEach = afterEach;
RuleTester.beforeAll = beforeAll;
RuleTester.beforeEach = beforeEach;
RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    parser: tseslint.parser,
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
});

const root = createProject();
const filename = path.join(root, 'src/widgets/widget.test.ts');
const jsdom = { environment: 'jsdom' };
const node = { environment: 'node' };
const rendered = lines(
  "import { render, screen } from '@testing-library/react';",
  "it('renders', () => { render(null); expect(screen).toBeDefined(); });",
);

const inJsdom = (...parts) => ({ filename, code: lines(...parts, logic), options: [jsdom] });
const projectReport = (environment = 'jsdom', directive = '@vitest-environment') => [
  { messageId: 'unusedProjectEnvironment', data: { environment, directive }, line: 1 },
];
const directiveReport = (environment, line = 1, directive = '@vitest-environment') => [
  { messageId: 'unusedDirectiveEnvironment', data: { environment, directive }, line },
];
const overDomProjectReport = (environment) => [
  {
    messageId: 'unusedDirectiveOverDomProject',
    data: { environment, directive: '@vitest-environment' },
    line: 1,
  },
];

function writeFiles(files) {
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), text);
  }
}

const PLACEHOLDER = ['$', '{'].join('');
const CHAIN_LENGTH = 10;
const WIDE_COUNT = 250;
writeFiles({
  ...Object.fromEntries(
    Array.from({ length: CHAIN_LENGTH }, (_, index) => [
      `src/deep/link-${String(index)}.ts`,
      index === CHAIN_LENGTH - 1
        ? 'export const end = () => document.title;\n'
        : `export * from './link-${String(index + 1)}';\n`,
    ]),
  ),
  ...Object.fromEntries(
    Array.from({ length: WIDE_COUNT }, (_, index) => [
      `src/wide/part-${String(index)}.ts`,
      `export const part${String(index)} = ${String(index)};\n`,
    ]),
  ),
  'src/support/page-loader.ts': `export const load = (name: string) => import(\`../pages/${PLACEHOLDER}name}\`);\n`,
  'src/support/setup-chain.ts': "import './dom-helper';\n",
  'src/support/setup-pure.ts': "import './pure';\n",
  'packages/kit/package.json': JSON.stringify({ name: '@acme/kit', main: 'index.ts' }),
  'packages/kit/index.ts': 'export const title = () => document.title;\n',
  'packages/pure-kit/package.json': JSON.stringify({ name: '@acme/pure-kit', main: 'index.ts' }),
  'packages/pure-kit/index.ts': 'export const one = 1;\n',
});
mkdirSync(path.join(root, 'node_modules/@acme'), { recursive: true });
symlinkSync('../../packages/kit', path.join(root, 'node_modules/@acme/kit'));
symlinkSync('../../packages/pure-kit', path.join(root, 'node_modules/@acme/pure-kit'));
const wideImports = Array.from(
  { length: WIDE_COUNT },
  (_, index) => `import '../wide/part-${String(index)}';`,
);
const appAlias = { find: '#app', replacement: path.join(root, 'src') };
const appPattern = { find: { pattern: '^#app/(.*)$', flags: 'u' }, replacement: `${root}/src/$1` };
const aliasedHelper = "import { reset } from '#app/support/dom-helper';";
const support = (name) => path.join(root, 'src/support', name);
const withSetup = (environment, ...setupFiles) => [{ environment, setupFiles }];
const unusedInJsdom = (...parts) => ({ ...inJsdom(...parts), errors: projectReport() });

ruleTester.run('no-unused-dom-environment', rule, {
  valid: [
    { filename, code: lines(docblock('jsdom'), rendered), options: [node] },
    { filename, code: lines(docblock('happy-dom'), rendered) },
    { filename, code: lines(docblock('jsdom'), logic, 'document.body.innerHTML = "";') },
    { filename, code: logic, options: [node] },
    { filename, code: logic },
    { filename, code: lines(docblock('node'), logic), options: [jsdom] },
    { filename, code: lines(docblock('edge-runtime'), logic), options: [jsdom] },
    { filename, code: lines(docblock('node', 'jest'), logic), options: [jsdom] },
    { filename, code: lines(rendered, logic), options: [{}] },
    {
      filename: path.join(root, 'src/widgets/helpers.ts'),
      code: lines(docblock('jsdom'), logic),
    },
    ...[
      'window.scrollTo(0, 0);',
      'localStorage.clear();',
      'const node = new MutationObserver(() => {});',
      'const event = new KeyboardEvent("keydown");',
      'const style = getComputedStyle(x);',
      'globalThis.document.title = "";',
      'global["window"] = undefined;',
      'navigator.clipboard.writeText("");',
      'const agent = navigator;',
      'class Fancy extends HTMLElement {}',
      'requestAnimationFrame(() => undefined);',
      'const bound = matchMedia("(min-width: 1px)");',
    ].map((statement) => inJsdom(statement)),
    ...[
      "import '@testing-library/jest-dom/vitest';",
      "import { render } from '@solidjs/testing-library';",
      "import { render } from '@acme/testing-library';",
      "import { act } from 'react-dom/test-utils';",
      "import { mount } from 'enzyme';",
      "import { mount } from '@vue/test-utils';",
      "import App from './App.vue';",
      "import Gauge from './Gauge.svelte';",
      "import { composeStories } from '@storybook/react';",
      "const dom = require('@testing-library/dom');",
      "const dom = await import('@testing-library/dom');",
      "import dom = require('@testing-library/dom');",
      "export * from '@testing-library/react';",
      "vi.mock('@testing-library/dom');",
      "vi.doMock('@testing-library/dom', () => ({}));",
      "const actual = await vi.importActual('@testing-library/dom');",
      "import { Button } from './Button.tsx';",
      "import { Button } from './Button.js';",
      "import { Button } from './Button';",
      "import { Panel } from './panel';",
      "import { reset } from '../support/dom-helper';",
      "import { renderApp } from '@/support/render';",
      "import { renderApp } from '~/render';",
      "import { renderApp } from '@/support';",
      "import { renderApp } from '../support/chain-a';",
      "import { userEvent } from '@storybook/test';",
      "import { axe } from 'jest-axe';",
      "import { axe } from 'vitest-axe';",
      "import { end } from '../deep/link-0';",
      "import { title } from '@acme/kit';",
    ].map((statement) => inJsdom(statement)),
    inJsdom(...wideImports),
    inJsdom(`const page = await import(\`./pages/${PLACEHOLDER}String(1)}\`);`),
    inJsdom('const name = "x";', 'const loaded = require(name);'),
    inJsdom("import { load } from '../support/page-loader';"),
    { filename, code: logic, options: withSetup('jsdom', support('dom-helper.ts')) },
    { filename, code: logic, options: withSetup('happy-dom', support('setup-chain.ts')) },
    { filename, code: logic, options: withSetup('jsdom', support('missing-setup.ts')) },
    {
      filename,
      code: lines(docblock('jsdom'), logic),
      options: withSetup('jsdom', support('dom-helper.ts')),
    },
    { ...inJsdom(aliasedHelper), options: [{ ...jsdom, aliases: [appAlias] }] },
    { ...inJsdom(aliasedHelper), options: [{ ...jsdom, aliases: [appPattern] }] },
  ],
  invalid: [
    { filename, code: lines(docblock('jsdom'), logic), errors: directiveReport('jsdom') },
    { filename, code: lines(docblock('happy-dom'), logic), errors: directiveReport('happy-dom') },
    {
      filename,
      code: lines("import { sum } from './format';", docblock('jsdom'), logic),
      options: [node],
      errors: directiveReport('jsdom', 2),
    },
    {
      filename,
      code: lines(`// ${docblock('jsdom').slice(4, -3)}`, logic),
      errors: directiveReport('jsdom'),
    },
    {
      filename,
      code: lines(`const note = '${docblock('jsdom')}';`, logic),
      errors: directiveReport('jsdom'),
    },
    {
      filename,
      code: lines(docblock('jsdom'), logic),
      options: [node],
      errors: directiveReport('jsdom'),
    },
    { filename, code: logic, options: [jsdom], errors: projectReport() },
    {
      filename,
      code: lines(docblock('jsdom', 'jest'), logic),
      options: [node],
      errors: directiveReport('jsdom', 1, '@jest-environment'),
    },
    {
      filename,
      code: lines(docblock('jsdom'), logic),
      options: [jsdom],
      errors: overDomProjectReport('jsdom'),
    },
    {
      filename,
      code: lines(docblock('happy-dom'), logic),
      options: [{ environment: 'happy-dom' }],
      errors: overDomProjectReport('happy-dom'),
    },
    unusedInJsdom(aliasedHelper),
    unusedInJsdom('const page = await import(`./format`);'),
    {
      filename,
      code: logic,
      options: withSetup('jsdom', '@testing-library/jest-dom/vitest', support('setup-pure.ts')),
      errors: projectReport(),
    },
    {
      filename,
      code: lines(docblock('jsdom'), logic),
      options: withSetup('node', support('dom-helper.ts')),
      errors: directiveReport('jsdom'),
    },
    unusedInJsdom("import { one } from '@acme/pure-kit';"),
    unusedInJsdom(...wideImports.slice(0, 20)),
    {
      filename,
      code: logic,
      options: [{ environment: 'happy-dom' }],
      errors: projectReport('happy-dom'),
    },
    {
      filename: path.join(root, 'src/widgets/widget.spec.mts'),
      code: logic,
      options: [jsdom],
      errors: projectReport(),
    },
    unusedInJsdom("import { sum } from './format';"),
    unusedInJsdom("import { sum } from '@/support/pure';"),
    unusedInJsdom("import { sum } from '@/support/pure-barrel';"),
    unusedInJsdom("import { a } from '../support/cycle-a';"),
    unusedInJsdom("import type { RenderResult } from '@testing-library/react';"),
    unusedInJsdom("import { type RenderResult } from '@testing-library/react';"),
    unusedInJsdom("import type { Box } from '@/support/types-only';"),
    unusedInJsdom("import { type Box } from '../support/types-only';"),
    unusedInJsdom('let holder: HTMLElement | undefined;'),
    unusedInJsdom('type Doc = typeof document;'),
    unusedInJsdom('interface Holder { node: HTMLElement }'),
    unusedInJsdom('const tag = <T extends HTMLElement>(value: T) => value;'),
    unusedInJsdom("import { renderToString } from 'react-dom/server';"),
    unusedInJsdom("import renderer from 'react-test-renderer';"),
    unusedInJsdom("import { render } from '@testing-library/react-native';"),
    unusedInJsdom("import { JSDOM } from 'jsdom';"),
    unusedInJsdom("import { format } from '@/missing';"),
    unusedInJsdom("vi.mock('../widgets/format');"),
    unusedInJsdom('const window = { width: 1 };', 'const document = [window];'),
    unusedInJsdom(
      'const settings = { window: 1, document: 2 }; settings.window += settings.document;',
    ),
    unusedInJsdom('const agent = navigator.userAgent;', 'const where = navigator.platform;'),
    unusedInJsdom(
      'const url = new URL("https://example.test/a?b=1");',
      'const body = new FormData();',
      'const blob = new Blob(["a"]);',
      'const controller = new AbortController();',
      'const bytes = new TextEncoder().encode("a");',
      'const copy = structuredClone({ a: 1 });',
      'const event = new Event("ping");',
      'const custom = new CustomEvent("ping");',
      'const target = new EventTarget();',
      'const request = fetch("https://example.test");',
      'const timer = performance.now();',
    ),
  ],
});
