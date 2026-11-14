import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Layout } from '../../adapters/typed/head-policy.mts';
import { resolveLayoutFor as untypedResolveLayoutFor } from '../layout.mjs';
import {
  isCustomLayout as untypedIsCustomLayout,
  layoutJscpdConfig as untypedLayoutJscpdConfig,
} from '../tool-configs.mjs';
import { fieldOf, listOf, parseJson, textOf } from '../../../../shared/values/readers.mts';

const resolveLayoutFor: (config: Readonly<Record<string, unknown>>) => Layout =
  untypedResolveLayoutFor;
const isCustomLayout: (layout: Layout) => boolean = untypedIsCustomLayout;
const layoutJscpdConfig: (base: unknown, layout: Layout) => { readonly ignore: string[] } =
  untypedLayoutJscpdConfig;

const base: unknown = parseJson(
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
    expect(listOf(fieldOf(base, 'ignore')).filter((glob) => !kept.includes(textOf(glob)))).toEqual([
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
