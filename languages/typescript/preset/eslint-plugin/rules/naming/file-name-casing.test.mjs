import { Linter } from 'eslint';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import tseslint from 'typescript-eslint';
import { afterAll, describe, expect, it } from 'vitest';
import { typescriptRuleTester } from '../../test-support/rule-tester.mjs';
import { rule } from './file-name-casing.mjs';

const ruleTester = typescriptRuleTester();
const roots = [];

afterAll(() => {
  for (const root of roots) {
    rmSync(root, { recursive: true, force: true });
  }
});

function folderWith(names) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-file-names-'));
  roots.push(root);
  mkdirSync(path.join(root, 'src'));
  for (const name of names) {
    writeFileSync(path.join(root, 'src', name), '');
  }
  return path.join(root, 'src');
}

const snakeFolder = folderWith(['a_b.ts', 'c_d.ts', 'e_f.ts', 'index.ts']);
const smallFolder = folderWith(['a_b.ts', 'c_d.ts']);
const tiedFolder = folderWith(['a_b.ts', 'c_d.ts', 'e-f.ts', 'g-h.ts']);
const code = 'export const a = 1;';

ruleTester.run('file-name-casing', rule, {
  valid: [
    { code, filename: 'src/user-profile.ts' },
    { code, filename: 'src/index.ts', options: [{ casing: 'snake_case' }] },
    { code, filename: 'src/userProfile.ts', options: [{ casing: 'camelCase' }] },
    { code, filename: 'src/user_profile.ts', options: [{ casing: 'snake_case' }] },
    { code, filename: 'src/UserProfile.tsx' },
    { code, filename: 'src/UserProfile.ts', options: [{ casing: 'camelCase' }] },
    { code, filename: 'src/useAuth.ts' },
    { code, filename: 'src/hooks/useSession.tsx', options: [{ casing: 'snake_case' }] },
    { code, filename: 'src/404.tsx', options: [{ casing: 'camelCase' }] },
    { code, filename: 'app/not-found.tsx', options: [{ casing: 'snake_case' }] },
    { code, filename: 'src/fr-CA.ts', options: [{ casing: 'camelCase' }] },
    { code, filename: 'src/foo.min.js', options: [{ casing: 'snake_case' }] },
    { code, filename: 'src/chunk-3f9a1c2b.js', options: [{ casing: 'camelCase' }] },
    { code, filename: 'src/__generated__/UserQuery.graphql.ts' },
    { code, filename: 'src/api/user_pb.ts' },
    { code, filename: 'src/api/userQuery.generated.ts' },
    { code, filename: 'tests/fixtures/some_file.ts' },
    { code, filename: 'vite.config.ts' },
    { code, filename: 'app/routes/[id].tsx' },
    { code, filename: 'app/routes/posts_.$id.tsx' },
    { code, filename: 'app/routes/sitemap[.]xml.ts' },
    { code, filename: 'app/routes/_layout.tsx' },
    { code, filename: 'app/routes/+page.server.ts' },
    { code: '', filename: 'src/_internal.ts' },
    { code, filename: path.join(snakeFolder, 'g_h.ts') },
    { code, filename: path.join(smallFolder, 'e-f.ts') },
    { code, filename: path.join(tiedFolder, 'i-j.ts') },
    {
      code,
      filename: path.join(snakeFolder, 'g-h.ts'),
      options: [{ casing: 'kebab-case', pinned: true }],
    },
  ],
  invalid: [
    {
      code,
      filename: 'src/userProfile.ts',
      errors: [
        { messageId: 'casing', data: { name: 'userProfile.ts', casing: 'kebab-case' }, line: 1 },
      ],
    },
    {
      code,
      filename: 'src/user-profile.test.ts',
      options: [{ casing: 'camelCase' }],
      errors: [
        { messageId: 'casing', data: { name: 'user-profile.test.ts', casing: 'camelCase' } },
      ],
    },
    {
      code,
      filename: 'src/user_profile.ts',
      errors: [{ messageId: 'casing' }],
    },
    {
      code,
      filename: path.join(snakeFolder, 'g-h.ts'),
      errors: [
        { messageId: 'folderCasing', data: { name: 'g-h.ts', casing: 'snake_case' }, line: 1 },
      ],
    },
    {
      code,
      filename: path.join(snakeFolder, 'g_h.ts'),
      options: [{ casing: 'kebab-case', pinned: true }],
      errors: [{ messageId: 'casing', data: { name: 'g_h.ts', casing: 'kebab-case' } }],
    },
    {
      code,
      filename: path.join(smallFolder, 'e-f.ts'),
      options: [{ casing: 'snake_case' }],
      errors: [{ messageId: 'casing', data: { name: 'e-f.ts', casing: 'snake_case' } }],
    },
    {
      code,
      filename: path.join(tiedFolder, 'iJ.ts'),
      errors: [{ messageId: 'casing', data: { name: 'iJ.ts', casing: 'kebab-case' } }],
    },
  ],
});

describe('file-name-casing messages', () => {
  function messageFor(filename) {
    const cwd = path.isAbsolute(filename) ? path.dirname(path.dirname(filename)) : process.cwd();
    const [{ message }] = new Linter({ cwd }).verify(
      code,
      [
        {
          files: ['**/*.ts'],
          languageOptions: { parser: tseslint.parser },
          plugins: { nitpicker: { rules: { 'file-name-casing': rule } } },
          rules: { 'nitpicker/file-name-casing': ['error', { casing: 'kebab-case' }] },
        },
      ],
      { filename },
    );
    return message;
  }

  it('names the casing and both ways out', () => {
    expect(messageFor('src/userProfile.ts')).toBe(
      'File name "userProfile.ts" is not kebab-case, which this project uses for file names. Rename it, pin a different casing with "conventions": { "typescript.fileNames": "camelCase" } in nitpicker.config.json, or add an "exceptions" entry for nitpicker/file-name-casing.',
    );
  });

  it('names the folder casing and the exception', () => {
    expect(messageFor(path.join(snakeFolder, 'g-h.ts'))).toBe(
      'File name "g-h.ts" is not snake_case, which most other files in this folder use. Rename it, or add an "exceptions" entry for nitpicker/file-name-casing.',
    );
  });
});
