import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveLayoutFor } from '../layout.mjs';
import { isCustomLayout, layoutJscpdConfig } from '../tool-configs.mjs';

const base = JSON.parse(
  readFileSync(path.join(import.meta.dirname, '../defaults/jscpd.json'), 'utf8'),
);

const kept = [
  'coverage/**',
  'reports/quality/**',
  '**/node_modules/**',
  '**/*.d.ts',
  '**/.stryker-tmp/**',
];

describe('skipped folders of the duplicate scan', () => {
  it('are exactly the project-root built-in folders of the default config', () => {
    expect(base.ignore.filter((glob) => !kept.includes(glob))).toEqual([
      'dist/**',
      'build/**',
      'generated/**',
      'target/**',
    ]);
  });

  it('replace the built-in folders with the ones the project lists', () => {
    const layout = resolveLayoutFor({
      exclude: ['legacy/**'],
      duplicates: { skippedFolders: ['dist'] },
    });

    expect(layoutJscpdConfig(base, layout).ignore).toEqual([...kept, '**/dist/**', 'legacy/**']);
    expect(
      layoutJscpdConfig(base, resolveLayoutFor({ duplicates: { skippedFolders: [] } })).ignore,
    ).toEqual(kept);
  });

  it('count a duplicate folder list as a custom layout', () => {
    expect(isCustomLayout(resolveLayoutFor({ duplicates: { skippedFolders: [] } }))).toBe(true);
  });
});
