import { describe, expect, it } from 'vitest';
import { resolveLayoutFor } from '../../layout.mjs';
import { layoutKnipProductionConfig } from './production-config.mjs';

const CODE = '{ts,tsx,mts,cts,js,jsx,mjs,cjs}';
const TEST_RUNNERS = [
  'ava',
  'cucumber',
  'cypress',
  'jest',
  'karma',
  'mocha',
  'playwright',
  'playwright-ct',
  'playwright-test',
  'rstest',
  'vitest',
  'webdriver-io',
];

describe('the knip config without tests', () => {
  it.each([
    'vitest.config.ts',
    'vitest.workspace.ts',
    'jest.config.ts',
    'jest.config.cjs',
    'src/main/jest.config.mts',
    '.mocharc.cjs',
    '.mocharc.yml',
  ])('leaves the %s test runner config out of the entries', (file) => {
    const layout = resolveLayoutFor({ layout: { sourceRoots: ['src/main'] } });

    const config = layoutKnipProductionConfig(
      { entry: ['src/main/main.ts', file], project: [] },
      layout,
    );

    expect(config.entry).toEqual(['src/main/main.ts']);
  });

  it('keeps the non-test entries and the rest of the config and leaves tests and stories out', () => {
    const layout = resolveLayoutFor({ layout: { sourceRoots: ['src/main'] } });
    const config = layoutKnipProductionConfig(
      {
        entry: ['src/main/main.ts', 'scripts/*.ts', 'vitest.config.ts', 'test/support.ts'],
        project: ['src/main/**'],
        ignore: ['x'],
        vite: true,
      },
      layout,
    );

    expect(config).toEqual({
      ...Object.fromEntries(TEST_RUNNERS.map((plugin) => [plugin, false])),
      entry: ['src/main/main.ts', 'scripts/*.ts'],
      project: [
        'src/main/**',
        `!test/**/*.${CODE}`,
        `!tests/**/*.${CODE}`,
        `!__tests__/**/*.${CODE}`,
        `!e2e/**/*.${CODE}`,
        `!src/main/**/*.{test,spec}.${CODE}`,
        '!src/main/**/__tests__/**',
        `!**/*.{stories,story}.${CODE}`,
      ],
      ignore: ['x'],
      vite: true,
    });
  });
});
