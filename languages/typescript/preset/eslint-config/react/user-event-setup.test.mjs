import { ESLint } from 'eslint';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import tseslint from 'typescript-eslint';
import { afterAll, describe, expect, it } from 'vitest';
import { resolveLayout } from '../../layout.mjs';
import { reactSyntaxConfigFor } from './react-scope.mjs';

const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-user-event-setup-'));

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

const eslint = new ESLint({
  cwd: root,
  overrideConfigFile: true,
  overrideConfig: [
    { files: ['**/*.{ts,tsx,jsx}'], languageOptions: { parser: tseslint.parser } },
    ...(await reactSyntaxConfigFor(resolveLayout())),
  ],
});

async function setupMessages(importLine, local = 'userEvent') {
  const code = [
    importLine,
    "import { screen } from '@testing-library/react';",
    `it('clicks', async () => { await ${local}.click(screen.getByRole('button')); });`,
    `it('types', async () => { const user = ${local}.setup(); await user.type(screen.getByRole('textbox'), 'a'); });`,
  ].join('\n');
  const [result] = await eslint.lintText(code, { filePath: path.join(root, 'test/a.test.tsx') });
  return result.messages
    .filter(({ ruleId }) => ruleId === 'testing-library/prefer-user-event-setup')
    .map(({ line, message }) => ({ line, method: message.match(/direct (\w+)\(\)/)?.[1] }));
}

describe('testing-library/prefer-user-event-setup', () => {
  it.each([
    ['the default import', "import userEvent from '@testing-library/user-event';"],
    ['the named import', "import { userEvent } from '@testing-library/user-event';"],
  ])('reports a direct call through %s once', async (_name, importLine) => {
    expect(await setupMessages(importLine)).toEqual([{ line: 3, method: 'click' }]);
  });

  it('follows a renamed named import', async () => {
    const importLine = "import { userEvent as events } from '@testing-library/user-event';";

    expect(await setupMessages(importLine, 'events')).toEqual([{ line: 3, method: 'click' }]);
  });

  it.each([
    ['userEvent', 'UE.userEvent'],
    ['default', 'UE.default'],
  ])('follows a namespace import through its %s member', async (_name, receiver) => {
    const importLine = "import * as UE from '@testing-library/user-event';";

    expect(await setupMessages(importLine, receiver)).toEqual([{ line: 3, method: 'click' }]);
  });
});
