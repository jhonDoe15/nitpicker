import { describe, expect, it } from 'vitest';
import { globToRegExp, resolveLayout } from '../layout.mjs';
import { createQualityChecks } from '../quality-checks.mjs';

function prettierPatterns(layout) {
  const check = createQualityChecks(layout).staticChecks.find(
    ({ name }) => name === 'prettier-format',
  );
  return check.patterns.map((pattern) => globToRegExp(pattern));
}

function isChecked(patterns, file) {
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

    for (const file of ['src/a.ts', 'src/a.mts', 'src/a.mjs', 'src/a.json', 'src/a.yml']) {
      expect(isChecked(patterns, file), file).toBe(true);
    }
    expect(isChecked(patterns, 'src/a.css')).toBe(false);
  });
});
