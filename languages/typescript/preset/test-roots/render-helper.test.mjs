import { RuleTester } from 'eslint';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import tseslint from 'typescript-eslint';
import { afterAll, afterEach, beforeAll, beforeEach, describe, it } from 'vitest';
import { rule as testMustUseProductionRuntime } from '../eslint-plugin/rules/testing/assertions/test-must-use-production-runtime.mjs';

RuleTester.afterAll = afterAll;
RuleTester.afterEach = afterEach;
RuleTester.beforeAll = beforeAll;
RuleTester.beforeEach = beforeEach;
RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-render-helper-'));
const renderLine = 'import { render } from "@testing-library/react";';
const appModule = '../../src/main/ui/app.js';
const helpers = {
  'render-app.tsx': [
    renderLine,
    `import { App } from '${appModule}';`,
    'export function renderApp() { return render(<App />); }',
  ],
  'reexport.ts': [`export { App } from '${appModule}';`],
  'library-only.tsx': [renderLine, 'export function renderApp() { return render(<main />); }'],
  'type-only.tsx': [
    renderLine,
    `import type { AppProps } from '${appModule}';`,
    'export function renderApp(props: AppProps) { return render(<main {...props} />); }',
  ],
  'inline-type.tsx': [
    renderLine,
    `import { type AppProps } from '${appModule}';`,
    'export function renderApp(props: AppProps) { return render(<main {...props} />); }',
  ],
  'commented.tsx': [
    renderLine,
    `const note = "import { App } from '${appModule}'";`,
    'export function renderApp() { return render(<main title={note} />); }',
  ],
  'chain.ts': ["export * from './reexport.js';"],
  'aliased.tsx': [
    renderLine,
    "import { App } from '@/main/ui/app.js';",
    'export function renderApp() { return render(<App />); }',
  ],
};
const projectFiles = {
  ...Object.fromEntries(
    Object.entries(helpers).map(([file, source]) => [`test/support/${file}`, source]),
  ),
  'src/main/ui/app.tsx': ['export function App() { return <main />; }'],
  'tsconfig.json': [
    JSON.stringify({
      compilerOptions: { types: [], lib: ['ES2022'], paths: { '@/*': ['./src/*'] } },
    }),
  ],
};

for (const [file, source] of Object.entries(projectFiles)) {
  mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  writeFileSync(path.join(root, file), `${source.join('\n')}\n`);
}

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

const testFile = path.join(root, 'test/ui/app.test.tsx');
const throughHelper = (helper) => ({
  filename: testFile,
  code: `import { renderApp } from '../support/${helper}';\nrenderApp();`,
});

new RuleTester({
  languageOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    parser: tseslint.parser,
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
}).run('test-must-use-production-runtime through a test helper', testMustUseProductionRuntime, {
  valid: [
    throughHelper('render-app.js'),
    throughHelper('reexport'),
    throughHelper('render-app'),
    throughHelper('chain.js'),
    throughHelper('aliased.js'),
    { filename: testFile, code: "import { App } from '@/main/ui/app.js';\nApp();" },
  ],
  invalid: [
    { ...throughHelper('library-only.js'), errors: [{ messageId: 'missingRuntime' }] },
    { ...throughHelper('type-only.js'), errors: [{ messageId: 'missingRuntime' }] },
    { ...throughHelper('inline-type.js'), errors: [{ messageId: 'missingRuntime' }] },
    { ...throughHelper('commented.js'), errors: [{ messageId: 'missingRuntime' }] },
    {
      filename: testFile,
      code: "import { App } from '@/main/ui/missing.js';\nApp();",
      errors: [{ messageId: 'missingRuntime' }],
    },
    { ...throughHelper('missing.js'), errors: [{ messageId: 'missingRuntime' }] },
  ],
});
