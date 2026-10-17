import { describe, expect, it } from 'vitest';
import { pnpmPackagePatterns } from './pnpm-workspace.mjs';

describe('pnpm workspace packages', () => {
  it('reads a block list at any indent and stops at the next key', () => {
    const text = [
      '# the apps and libraries',
      'packages:',
      "    - 'apps/*'",
      '    - "libs/**"  # nested',
      '    - !apps/skip',
      'catalog:',
      '  - not-a-package',
    ].join('\n');

    expect(pnpmPackagePatterns(text)).toEqual(['apps/*', 'libs/**', '!apps/skip']);
  });

  it('reads a block list without indent', () => {
    expect(pnpmPackagePatterns('packages:\n- apps/*\n- tools/*\n')).toEqual(['apps/*', 'tools/*']);
  });

  it('reads a flow array on one line or across lines', () => {
    expect(pnpmPackagePatterns('packages: [\'apps/*\', "!apps/skip"]\n')).toEqual([
      'apps/*',
      '!apps/skip',
    ]);
    expect(
      pnpmPackagePatterns('packages: [\n  apps/*,\n  libs/*\n]\nonlyBuiltDependencies: []\n'),
    ).toEqual(['apps/*', 'libs/*']);
  });

  it('reads only the packages key', () => {
    expect(pnpmPackagePatterns('onlyBuiltDependencies:\n  - esbuild\n')).toEqual([]);
    expect(pnpmPackagePatterns('catalog:\n  react: 19.2.0\npackages:\n  - apps/*\n')).toEqual([
      'apps/*',
    ]);
  });
});
