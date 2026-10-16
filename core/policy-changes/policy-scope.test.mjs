import { describe, expect, it } from 'vitest';
import { useGitFixtures } from '../diff/git/test-support/git-repository.mjs';
import { policyChangeFields } from './describe-policy-changes.mjs';
import { readPolicyScope } from './policy-scope.mjs';

const { createGitRepository } = useGitFixtures();
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
      JSON.stringify({ compilerOptions: { allowJs: true, checkJs: value } });
    const root = JSON.stringify({ files: [], references: [{ path: './config/app.json' }] });

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
