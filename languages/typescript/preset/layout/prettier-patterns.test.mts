import { describe, expect, it } from 'vitest';
import { globMatcher as untypedGlobMatcher, resolveLayout } from '../layout.mjs';
import { createQualityChecks as untypedCreateQualityChecks } from '../quality-checks.mjs';

const globMatcher: (glob: string) => RegExp = untypedGlobMatcher;
const createQualityChecks: (layout: ReturnType<typeof resolveLayout>) => {
  readonly staticChecks: readonly { readonly name: string; readonly patterns: readonly string[] }[];
} = untypedCreateQualityChecks;

function prettierPatterns(layout: ReturnType<typeof resolveLayout>): RegExp[] {
  const check = createQualityChecks(layout).staticChecks.find(
    ({ name }) => name === 'prettier-format',
  );
  if (check === undefined) {
    throw new Error('prettier-format check is missing');
  }
  return check.patterns.map((pattern) => globMatcher(pattern));
}

function isChecked(patterns: readonly RegExp[], file: string): boolean {
  return patterns.some((pattern) => pattern.test(file));
}

describe('the Prettier check patterns', () => {
  it('cover .tsx files in source roots, test roots and the project root', () => {
    const patterns = prettierPatterns(resolveLayout());

    expect(isChecked(patterns, 'src/main/ui/panel.tsx')).toBe(true);
    expect(isChecked(patterns, 'test/panel.tsx')).toBe(true);
    expect(isChecked(patterns, 'vitest.setup.tsx')).toBe(true);
  });

  it('follow a custom layout for .tsx files', () => {
    const patterns = prettierPatterns(resolveLayout({ sourceRoots: ['lib'], testRoots: ['spec'] }));

    expect(isChecked(patterns, 'lib/ui/panel.tsx')).toBe(true);
    expect(isChecked(patterns, 'spec/panel.tsx')).toBe(true);
    expect(isChecked(patterns, 'src/ui/panel.tsx')).toBe(false);
  });

  it('keep checking the previous file types', () => {
    const patterns = prettierPatterns(resolveLayout());

    const files = ['src/a.ts', 'src/a.mts', 'src/a.mjs', 'src/a.json', 'src/a.yml'];
    expect(files.map((file) => isChecked(patterns, file))).toEqual(files.map(() => true));
    expect(isChecked(patterns, 'src/a.css')).toBe(false);
  });
});
