import { ESLint } from 'eslint';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import tseslint from 'typescript-eslint';
import { afterAll, describe, expect, it } from 'vitest';
import { resolveLayout } from '../../layout.mjs';
import { reactSyntaxConfigFor } from '../react-scope.mjs';

const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-react-test-scope-'));
const files = {
  'test/support/render-app.tsx':
    "import { render } from '@testing-library/react';\nexport function renderApp() { return render(<main />); }\n",
  'test/support/rtl/index.ts': "export * from '@testing-library/react';\n",
  'test/support/fixtures.ts': 'export function renderApp() { return { container: {} }; }\n',
  'test/support/chain.ts': "export * from './rtl';\n",
  'tsconfig.json': JSON.stringify({ compilerOptions: { paths: { '@test/*': ['./test/*'] } } }),
};

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

for (const [file, source] of Object.entries(files)) {
  mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  writeFileSync(path.join(root, file), source);
}

const eslint = new ESLint({
  cwd: root,
  overrideConfigFile: true,
  overrideConfig: [
    { files: ['**/*.{ts,tsx,jsx}'], languageOptions: { parser: tseslint.parser } },
    ...(await reactSyntaxConfigFor(resolveLayout())),
  ],
});

async function ruleIdsFor(file, code) {
  const [result] = await eslint.lintText(code, { filePath: path.join(root, file) });
  return result.messages.map(({ ruleId }) => ruleId);
}

const helperQueries = [
  'const { container, getByTestId } = renderApp();',
  "container.querySelector('.todo-list');",
  "getByTestId('save');",
].join('\n');

describe('the React test rules', () => {
  it.each([
    ['a render helper', "import { renderApp } from '../support/render-app.js';"],
    [
      'a folder that re-exports Testing Library',
      "import { render as renderApp } from '../support/rtl';",
    ],
    ['a re-export chain', "import { render as renderApp } from '../support/chain';"],
    ['a path alias', "import { renderApp } from '@test/support/render-app.js';"],
  ])('apply to a test that reaches Testing Library through %s', async (_name, importLine) => {
    expect(
      await ruleIdsFor('test/ui/via-helper.test.ts', `${importLine}\n${helperQueries}`),
    ).toEqual([
      'testing-library/no-node-access',
      'testing-library/prefer-screen-queries',
      'testing-library/no-test-id-queries',
    ]);
  });

  it('leave a test whose helper does not use Testing Library alone', async () => {
    const code = `import { renderApp } from '../support/fixtures.js';\n${helperQueries}\nwrapper.state();`;

    expect(await ruleIdsFor('test/domain/store.test.ts', code)).toEqual([]);
  });

  it('apply to every .tsx and .jsx test, whatever it imports', async () => {
    const code = "import { Panel } from '../../src/main/ui/panel.js';\nwrapper.instance(<Panel />);";

    expect(await ruleIdsFor('test/ui/panel.test.tsx', code)).toEqual([
      'nitpicker/react-test-no-implementation-details',
    ]);
    expect(await ruleIdsFor('src/main/ui/panel.spec.jsx', code)).toEqual([
      'nitpicker/react-test-no-implementation-details',
    ]);
  });

  it('leave Playwright and Cypress component tests alone', async () => {
    const playwright =
      "import { test } from '@playwright/experimental-ct-react';\nwrapper.state();";
    const cypress = "import { mount } from 'cypress/react';\nwrapper.state();";

    expect(await ruleIdsFor('test/ui/panel.spec.tsx', playwright)).toEqual([]);
    expect(await ruleIdsFor('test/ui/panel.cy.tsx', cypress)).toEqual([]);
  });
});
