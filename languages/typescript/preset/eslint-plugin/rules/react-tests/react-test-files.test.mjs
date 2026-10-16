import { Linter } from 'eslint';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import tseslint from 'typescript-eslint';
import { afterEach, describe, expect, it } from 'vitest';
import { inReactTestFilesOnly } from './react-test-files.mjs';

const temporaryRoots = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

const probe = {
  meta: { type: 'problem', schema: [], messages: { seen: 'Seen.' } },
  create: inReactTestFilesOnly((context) => ({
    Program(node) {
      context.report({ node, messageId: 'seen' });
    },
  })),
};

function projectWith(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-react-test-files-'));
  temporaryRoots.push(root);
  const tsconfig = {
    compilerOptions: { baseUrl: '.', paths: { '@/*': ['src/*'] }, types: [], lib: ['ES2022'] },
  };
  for (const [file, text] of Object.entries({
    'tsconfig.json': JSON.stringify(tsconfig),
    ...files,
  })) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), text);
  }
  return root;
}

const settingsProbe = {
  meta: { type: 'problem', schema: [], messages: { seen: '{{module}}' } },
  create: inReactTestFilesOnly((context) => ({
    Program(node) {
      const module = String(context.settings['testing-library/utils-module']);
      context.report({ node, messageId: 'seen', data: { module } });
    },
  })),
};

function lintIn(root, code, plugin, rules) {
  const linter = new Linter({ cwd: root });
  const config = [
    {
      files: ['**/*.{ts,tsx}'],
      languageOptions: { parser: tseslint.parser },
      plugins: { demo: plugin },
      settings: { 'testing-library/utils-module': 'test-utils' },
      rules,
    },
  ];
  return linter.verify(code, config, path.join(root, 'test/ui/a.test.ts'));
}

function runsIn(root, code) {
  const messages = lintIn(root, code, { rules: { probe } }, { 'demo/probe': 'error' });
  return messages.some(({ ruleId }) => ruleId === 'demo/probe');
}

const testUtils = "export { render } from '@testing-library/react';\n";
const renderHelper =
  "import { render } from '@testing-library/react';\nexport function renderPage(node) { return render(node); }\n";

describe('the React test file detection', () => {
  it.each([
    ['a Testing Library import', "import { render } from '@testing-library/react';"],
    ['a relative test-utils import', "import { render } from '../../src/test-utils';"],
    ['a tsconfig path alias to test-utils', "import { render } from '@/test-utils';"],
    ['an alias to a test-utils folder', "import { render } from '@/testing/test-utils';"],
    ['a barrel that re-exports test-utils', "import { render } from '@/testing';"],
    ['a relative barrel that re-exports test-utils', "import { render } from '../../src/testing';"],
    ['a barrel that re-exports Testing Library', "import { render } from '@/support';"],
    ['a helper that imports Testing Library', "import { renderPage } from '@/test/render';"],
    ['a barrel that re-exports such a helper', "import { renderPage } from '@/helpers';"],
  ])('runs the rule for %s', (_name, code) => {
    const root = projectWith({
      'src/test-utils.tsx': testUtils,
      'src/testing/test-utils/index.tsx': testUtils,
      'src/testing/index.ts': "export * from './test-utils';\n",
      'src/support/index.ts': "export { screen } from '@testing-library/react';\n",
      'src/test/render.tsx': renderHelper,
      'src/helpers/index.ts': "export * from './page';\n",
      'src/helpers/page.tsx': renderHelper,
    });

    expect(runsIn(root, code)).toBe(true);
  });

  it.each([
    ['a domain import through the alias', "import { sum } from '@/domain/sum';"],
    ['a barrel of domain modules', "import { sum } from '@/domain';"],
    ['an alias that resolves nowhere', "import { render } from '@/missing';"],
    ['a component that imports react', "import { Badge } from '@/ui/badge';"],
  ])('skips the rule for %s', (_name, code) => {
    const root = projectWith({
      'src/ui/badge.tsx': "import { memo } from 'react';\nexport const Badge = memo(() => null);\n",
      'src/domain/sum.ts': 'export const sum = (a: number, b: number) => a + b;\n',
      'src/domain/index.ts': "export * from './sum';\nexport * from './index';\n",
    });

    expect(runsIn(root, code)).toBe(false);
  });

  it('treats the helper import as the Testing Library module for the wrapped rule', async () => {
    const { testingLibraryPlugin } = await import('../../../eslint-config/react/react-plugins.mjs');
    const root = projectWith({ 'src/test/render.tsx': renderHelper });
    const code =
      "import { renderPage } from '@/test/render';\nrenderPage(null).getByTestId('a');\n";
    const direct = "import { render } from '@testing-library/react';\n";
    const settingOf = (text) =>
      lintIn(root, text, { rules: { probe: settingsProbe } }, { 'demo/probe': 'error' })[0].message;
    const queries = lintIn(root, code, testingLibraryPlugin, {
      'demo/no-test-id-queries': 'error',
    });

    expect(settingOf(code)).toBe('@/test/render');
    expect(settingOf(direct)).toBe('test-utils');
    expect(queries.map(({ line }) => line)).toEqual([2]);
  });
});
