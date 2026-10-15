import { RuleTester } from 'eslint';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import tseslint from 'typescript-eslint';
import { afterAll, afterEach, beforeAll, beforeEach, describe, it } from 'vitest';
import { rule as testMustUseProductionRuntime } from '../eslint-plugin/rules/test-must-use-production-runtime.mjs';

RuleTester.afterAll = afterAll;
RuleTester.afterEach = afterEach;
RuleTester.beforeAll = beforeAll;
RuleTester.beforeEach = beforeEach;
RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-render-helper-'));
const helpers = {
  'render-app.tsx':
    "import { render } from '@testing-library/react';\nimport { App } from '../../src/main/ui/app.js';\nexport function renderApp() { return render(<App />); }\n",
  'reexport.ts': "export { App } from '../../src/main/ui/app.js';\n",
  'library-only.tsx':
    "import { render } from '@testing-library/react';\nexport function renderApp() { return render(<main />); }\n",
  'type-only.tsx':
    "import { render } from '@testing-library/react';\nimport type { AppProps } from '../../src/main/ui/app.js';\nexport function renderApp(props: AppProps) { return render(<main {...props} />); }\n",
};

for (const [file, source] of Object.entries(helpers)) {
  mkdirSync(path.join(root, 'test/support'), { recursive: true });
  writeFileSync(path.join(root, 'test/support', file), source);
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
  valid: [throughHelper('render-app.js'), throughHelper('reexport'), throughHelper('render-app')],
  invalid: [
    { ...throughHelper('library-only.js'), errors: [{ messageId: 'missingRuntime' }] },
    { ...throughHelper('type-only.js'), errors: [{ messageId: 'missingRuntime' }] },
    { ...throughHelper('missing.js'), errors: [{ messageId: 'missingRuntime' }] },
  ],
});
