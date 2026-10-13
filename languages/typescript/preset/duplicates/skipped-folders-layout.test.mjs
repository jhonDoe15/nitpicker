import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveLayoutFor } from '../layout.mjs';
import { isCustomLayout, layoutJscpdConfig } from '../tool-configs.mjs';

const base = JSON.parse(
  readFileSync(path.join(import.meta.dirname, '../defaults/jscpd.json'), 'utf8'),
);

describe('skipped folders of the duplicate scan', () => {
  it('replace the built-in folders with the ones the project lists', () => {
    const kept = [
      '**/node_modules/**',
      '**/*.d.ts',
      '**/coverage/**',
      '**/reports/**',
      '**/.stryker-tmp/**',
    ];
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
