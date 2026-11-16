import { ESLint } from 'eslint';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import tseslint from 'typescript-eslint';
import { afterAll, describe, expect, it } from 'vitest';
import { rule } from './no-mutating-method-in-domain.mts';
import { ruleModule } from '../../test-support/rule-tester.mts';

const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-domain-mutation-'));
const domain = 'src/main/features/greeting/domain';

const typed = new ESLint({
  cwd: root,
  overrideConfigFile: true,
  overrideConfig: [
    {
      files: ['**/*.cjs'],
      languageOptions: {
        parser: tseslint.parser,
        sourceType: 'commonjs',
        parserOptions: {
          projectService: { allowDefaultProject: [`${domain}/*.cjs`] },
          tsconfigRootDir: root,
        },
      },
      plugins: { nitpicker: { rules: { 'no-mutating-method-in-domain': ruleModule(rule) } } },
      rules: { 'nitpicker/no-mutating-method-in-domain': 'error' },
    },
  ],
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('no-mutating-method-in-domain', () => {
  it('reads a method whose declaration has no parent node without crashing', async () => {
    mkdirSync(path.join(root, domain), { recursive: true });
    const file = path.join(root, domain, 'initials.cjs');
    const code = [
      "const { basename } = require('node:path');",
      'function initials(name) {',
      '  return basename(name).slice(0, 1).toUpperCase();',
      '}',
      'module.exports = { initials };',
      '',
    ].join('\n');
    writeFileSync(file, code);

    const [result] = await typed.lintFiles([file]);

    expect(result?.messages).toEqual([]);
  });
});
