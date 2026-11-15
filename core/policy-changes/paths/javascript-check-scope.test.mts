import { describe, expect, it } from 'vitest';
import { between } from '../build-files/test-support/policy-fixtures.mts';
import { createPolicyScope } from '../policy-scope.mts';
import { tsconfigChanges } from './tsconfig-changes.mts';

type Files = Readonly<Record<string, string>>;

const SOURCE: Files = { 'src/a.mjs': 'export const value = JSON.parse("{}").field;\n' };
const PINNED = { types: [], lib: ['ES2022'] };
const CHECKED = {
  compilerOptions: { ...PINNED, allowJs: true, checkJs: true },
  include: ['src'],
};
const NARROWED = 'JavaScript type-aware checks no longer cover: src/a.mjs';

function filesWithConfig(config: object, files: Files = SOURCE): Files {
  return { ...files, 'tsconfig.json': JSON.stringify(config) };
}

describe('JavaScript type-aware checking scope changes', () => {
  it.each([
    ['exclude', { ...CHECKED, exclude: ['src/a.mjs'] }],
    ['include', { ...CHECKED, include: ['other'] }],
    ['files', { compilerOptions: CHECKED.compilerOptions, files: [] }],
  ])('reports previously checked JavaScript hidden by %s', (_name, config) => {
    const fields = between({
      base: filesWithConfig(CHECKED),
      head: filesWithConfig(config),
      config: {},
    });

    expect(fields.policyLoosenings).toEqual([NARROWED]);
    expect(fields.policyKinds[NARROWED]).toBe('checked-js-scope');
  });

  it('reports checked JavaScript lost when the selected solution drops its reference', () => {
    const files = {
      ...SOURCE,
      'config/tsconfig.json': JSON.stringify({ ...CHECKED, include: ['../src'] }),
    };
    const solution = { files: [], references: [{ path: './config' }] };
    const fields = between({
      base: filesWithConfig(solution, files),
      head: filesWithConfig({ files: [] }, files),
      config: { tools: { typescript: { project: 'tsconfig.json' } } },
    });

    expect(fields.policyLoosenings).toEqual([NARROWED]);
  });

  it('follows the explicitly selected project config', () => {
    const fields = between({
      base: { ...SOURCE, 'tsconfig.app.json': JSON.stringify(CHECKED) },
      head: {
        ...SOURCE,
        'tsconfig.app.json': JSON.stringify({ ...CHECKED, exclude: ['src/a.mjs'] }),
      },
      config: { tools: { typescript: { project: 'tsconfig.app.json' } } },
    });

    expect(fields.policyLoosenings).toEqual([NARROWED]);
  });

  it('does not report an equivalent include or JavaScript that was never checked', () => {
    const fields = between({
      base: filesWithConfig(CHECKED),
      head: filesWithConfig(
        { ...CHECKED, include: ['src/**/*.mjs'] },
        { ...SOURCE, 'other/new.mjs': 'export const added = true;\n' },
      ),
      config: {},
    });

    expect(fields.policyLoosenings).toEqual([]);
  });

  it('does not report deleted JavaScript or unchanged unchecked coverage', () => {
    const fields = between({
      base: filesWithConfig(CHECKED),
      head: filesWithConfig({ ...CHECKED, include: ['other'] }, {}),
      config: {},
    });
    const unchecked = filesWithConfig({
      ...CHECKED,
      compilerOptions: { ...PINNED, allowJs: true },
    });
    const unchanged = between({ base: unchecked, head: unchecked, config: {} });

    expect([fields.policyLoosenings, unchanged.policyLoosenings]).toEqual([[], []]);
  });

  it('keeps checks when a JavaScript file moves within the checked include', () => {
    const fields = tsconfigChanges({
      ...createPolicyScope({ files: [], baseRoots: {}, headRoots: {}, headConfig: {} }),
      code: ['src/moved.mjs'],
      basePathOf: () => 'src/a.mjs',
      tsconfigs: { base: new Map(), head: new Map() },
      checkedJavascript: {
        base: new Set(['src/a.mjs']),
        head: new Set(['src/moved.mjs']),
      },
    });

    expect(fields).toEqual({ loosened: [], changed: [] });
  });
});
