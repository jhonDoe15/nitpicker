import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { useProjectFixtures } from '../diff/git/test-support/projects/project-fixtures.mjs';
import { nestedCheckout, useGitCheckouts } from '../diff/git/test-support/git-checkout.mjs';
import { useGitFixtures } from '../diff/git/test-support/git-repository.mjs';
import { policyChangeFields } from './describe-policy-changes.mjs';
import { listedFiles, readPolicyScope } from './policy-scope.mjs';

const { createGitRepository } = useGitFixtures();
const { gitCheckout } = useGitCheckouts();
const { outsideGit } = useProjectFixtures();
const vendor = { exclude: ['src/vendor/**'] };

function fieldsBetween({ base, head, baseConfig = {}, headConfig = baseConfig }) {
  const scope = readPolicyScope({
    baseConfig,
    headConfig,
    baseProjectRoot: createGitRepository(base).root,
    headProjectRoot: createGitRepository(head).root,
  });
  return policyChangeFields(baseConfig, headConfig, scope);
}

describe('readPolicyScope', () => {
  it('reads the preset a first config has to declare from the head checkout', () => {
    const java = { 'pom.xml': '<project/>\n', 'src/main/java/A.java': 'class A {}\n' };
    const typescript = { 'src/a.ts': 'export {};\n' };
    const declared = (files) =>
      fieldsBetween({ base: files, head: files, headConfig: { preset: 'java' } }).policyLoosenings;

    expect([declared(java), declared(typescript)]).toEqual([[], ['preset: not set -> "java"']]);
  });

  it('reads checkJs from every project tsconfig, and counts a removed one', () => {
    const checkJs = (value) =>
      JSON.stringify({
        compilerOptions: { allowJs: true, checkJs: value, types: [], lib: ['ES2022'] },
      });
    const root = JSON.stringify({
      compilerOptions: { types: [], lib: ['ES2022'] },
      files: [],
      references: [{ path: './config/app.json' }],
    });

    expect(
      fieldsBetween({
        base: {
          'tsconfig.json': root,
          'config/app.json': checkJs(true),
          'packages/web/tsconfig.json': checkJs(false),
        },
        head: { 'tsconfig.json': root, 'config/app.json': checkJs(false) },
      }).policyLoosenings,
    ).toEqual([
      'tsconfig removed: packages/web/tsconfig.json',
      'config/app.json checkJs: true -> false',
    ]);
  });

  it('follows production imports through a hidden barrel and from package.json entries', () => {
    const base = {
      'src/orders/total.ts': 'export const total = 1;\n',
      'src/vendor/index.ts': 'export {};\n',
    };
    const head = {
      'package.json': JSON.stringify({ bin: { serve: './src/vendor/server.ts' } }),
      'src/orders/total.ts': "export * from '../vendor/index';\n",
      'src/vendor/index.ts': "export * from './feature';\n",
      'src/vendor/feature.ts': 'export const feature = 1;\n',
      'src/vendor/server.ts': 'export {};\n',
      'src/vendor/unused.ts': 'export {};\n',
    };

    expect(fieldsBetween({ base, head, baseConfig: vendor }).policyLoosenings).toEqual([
      'exclude and layout.excludedGlobs hide code this change adds or moves that production code imports: ' +
        'src/vendor/feature.ts (imported by src/orders/total.ts), src/vendor/server.ts (imported by package.json bin)',
    ]);
  });

  it('changes the digest when a hidden file changes, though the text stays the same', () => {
    const run = (text) =>
      fieldsBetween({
        base: { 'src/a.ts': 'export {};\n' },
        head: { 'src/a.ts': 'export {};\n', 'lib/feature.ts': text },
        headConfig: { exclude: ['lib/**'] },
      });
    const first = run('export const a = 1;\n');
    const second = run('export const a: any = 1;\n');

    expect(second.policyLoosenings).toEqual(first.policyLoosenings);
    expect(second.policyDigest).not.toBe(first.policyDigest);
  });
});

describe('listedFiles', () => {
  it('names the Git failure of a real checkout instead of calling it no checkout', () => {
    const root = createGitRepository({ 'src/a.ts': '' }).root;
    writeFileSync(path.join(root, '.git', 'index'), 'broken');

    expect(() => listedFiles(root)).toThrow(/git ls-files failed/u);
  });

  it('lists the files of the Git checkout, not ignored folders or nested checkouts', () => {
    const root = gitCheckout(
      {
        'src/a.ts': '',
        'scratch/b.ts': '',
        ...nestedCheckout('.claude/worktrees/x', { 'tsconfig.json': '{}', 'c.ts': '' }),
      },
      ['scratch/'],
    );

    expect(listedFiles(root)).toEqual(['src/a.ts']);
  });

  it('lists nothing for a folder that does not exist', () => {
    expect(listedFiles(path.join(gitCheckout({}), 'missing'))).toEqual([]);
  });

  it('walks a folder that is outside Git instead of refusing it', () => {
    const root = outsideGit({ 'src/a.ts': '' });

    expect(listedFiles(root)).toEqual(['src/a.ts']);
  });
});
