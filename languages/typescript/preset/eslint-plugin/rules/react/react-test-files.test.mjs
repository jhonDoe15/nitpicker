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

function runsIn(root, code) {
  const linter = new Linter({ cwd: root });
  const config = [
    {
      files: ['**/*.tsx'],
      languageOptions: { parser: tseslint.parser },
      plugins: { demo: { rules: { probe } } },
      rules: { 'demo/probe': 'error' },
    },
  ];
  const messages = linter.verify(code, config, path.join(root, 'test/ui/a.test.tsx'));
  return messages.some(({ ruleId }) => ruleId === 'demo/probe');
}

const testUtils = "export { render } from '@testing-library/react';\n";

describe('the React test file detection', () => {
  it.each([
    ['a Testing Library import', "import { render } from '@testing-library/react';"],
    ['a relative test-utils import', "import { render } from '../../src/test-utils';"],
    ['a tsconfig path alias to test-utils', "import { render } from '@/test-utils';"],
    ['an alias to a test-utils folder', "import { render } from '@/testing/test-utils';"],
    ['a barrel that re-exports test-utils', "import { render } from '@/testing';"],
    ['a relative barrel that re-exports test-utils', "import { render } from '../../src/testing';"],
    ['a barrel that re-exports Testing Library', "import { render } from '@/support';"],
  ])('runs the rule for %s', (_name, code) => {
    const root = projectWith({
      'src/test-utils.tsx': testUtils,
      'src/testing/test-utils/index.tsx': testUtils,
      'src/testing/index.ts': "export * from './test-utils';\n",
      'src/support/index.ts': "export { screen } from '@testing-library/react';\n",
    });

    expect(runsIn(root, code)).toBe(true);
  });

  it.each([
    ['a domain import through the alias', "import { sum } from '@/domain/sum';"],
    ['a barrel of domain modules', "import { sum } from '@/domain';"],
    ['an alias that resolves nowhere', "import { render } from '@/missing';"],
  ])('skips the rule for %s', (_name, code) => {
    const root = projectWith({
      'src/domain/sum.ts': 'export const sum = (a: number, b: number) => a + b;\n',
      'src/domain/index.ts': "export * from './sum';\nexport * from './index';\n",
    });

    expect(runsIn(root, code)).toBe(false);
  });
});
