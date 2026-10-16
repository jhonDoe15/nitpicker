import { Linter } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';
import { typescriptRuleTester } from '../../test-support/rule-tester.mjs';
import { rule } from './file-name-casing.mjs';

const ruleTester = typescriptRuleTester();

ruleTester.run('file-name-casing', rule, {
  valid: [
    { code: 'export const a = 1;', filename: 'src/user-profile.ts' },
    { code: 'export const a = 1;', filename: 'src/index.ts', options: [{ casing: 'snake_case' }] },
    {
      code: 'export const a = 1;',
      filename: 'src/userProfile.ts',
      options: [{ casing: 'camelCase' }],
    },
    {
      code: 'export const a = 1;',
      filename: 'src/user_profile.ts',
      options: [{ casing: 'snake_case' }],
    },
    { code: 'export const a = 1;', filename: 'src/UserProfile.tsx' },
    {
      code: 'export const a = 1;',
      filename: 'src/UserProfile.test.tsx',
      options: [{ casing: 'camelCase' }],
    },
    { code: 'export const a = 1;', filename: 'vite.config.ts' },
    { code: 'export const a = 1;', filename: 'app/routes/[id].tsx' },
    { code: 'export const a = 1;', filename: 'app/routes/+page.server.ts' },
    { code: '', filename: 'src/_internal.ts' },
  ],
  invalid: [
    {
      code: 'export const a = 1;',
      filename: 'src/userProfile.ts',
      errors: [
        {
          messageId: 'casing',
          data: { name: 'userProfile.ts', casing: 'kebab-case' },
          line: 1,
          column: 1,
        },
      ],
    },
    {
      code: 'export const a = 1;',
      filename: 'src/user-profile.test.ts',
      options: [{ casing: 'camelCase' }],
      errors: [
        { messageId: 'casing', data: { name: 'user-profile.test.ts', casing: 'camelCase' } },
      ],
    },
    {
      code: 'export const a = 1;',
      filename: 'src/UserProfile.ts',
      errors: [{ messageId: 'casing', data: { name: 'UserProfile.ts', casing: 'kebab-case' } }],
    },
    {
      code: '',
      filename: 'src/user-profile.ts',
      options: [{ casing: 'PascalCase' }],
      errors: [{ messageId: 'casing', data: { name: 'user-profile.ts', casing: 'PascalCase' } }],
    },
  ],
});

describe('file-name-casing message', () => {
  it('names the casing and both ways out', () => {
    const [{ message }] = new Linter().verify(
      'export const a = 1;',
      [
        {
          files: ['**/*.ts'],
          languageOptions: { parser: tseslint.parser },
          plugins: { nitpicker: { rules: { 'file-name-casing': rule } } },
          rules: { 'nitpicker/file-name-casing': ['error', { casing: 'kebab-case' }] },
        },
      ],
      { filename: 'src/userProfile.ts' },
    );

    expect(message).toBe(
      'File name "userProfile.ts" is not kebab-case, which this project uses for file names. Rename it, pin a different casing with "conventions": { "typescript.fileNames": "camelCase" } in nitpicker.config.json, or add an "exceptions" entry for nitpicker/file-name-casing.',
    );
  });
});
