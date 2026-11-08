import { describe, expect, it } from 'vitest';
import { resolveLayout } from '../preset/layout.mjs';
import { fixTargets } from './fix-targets.mjs';

function selection(layout, files) {
  const { isEslintFile, isPrettierFile } = fixTargets(layout);
  return files.map((file) => [file, isEslintFile(file), isPrettierFile(file)]);
}

describe('fixTargets', () => {
  it('selects the files eslint-lint and prettier-format check in a TypeScript project', () => {
    expect(
      selection(resolveLayout(), [
        'src/main/a.ts',
        'src/main/a.js',
        'src/main/config.yaml',
        'src/README.md',
        'src/main/style.css',
        'tests/a.test.ts',
        'tests/data.yaml',
        'package.json',
        'eslint.config.mjs',
        'docs/guide.md',
        'scripts/tool.ts',
        'coverage/a.json',
      ]),
    ).toEqual([
      ['src/main/a.ts', true, true],
      ['src/main/a.js', true, false],
      ['src/main/config.yaml', false, true],
      ['src/README.md', false, false],
      ['src/main/style.css', false, false],
      ['tests/a.test.ts', true, true],
      ['tests/data.yaml', false, false],
      ['package.json', false, true],
      ['eslint.config.mjs', false, true],
      ['docs/guide.md', false, false],
      ['scripts/tool.ts', false, false],
      ['coverage/a.json', false, false],
    ]);
  });

  it('follows the JavaScript layout, custom roots and excludes', () => {
    const layout = resolveLayout({ sourceRoots: ['lib'], testRoots: ['spec'] }, ['lib/legacy/**'], {
      javascript: true,
    });
    expect(
      selection(layout, [
        'lib/a.js',
        'lib/a.cjs',
        'lib/legacy/old.js',
        'spec/a.spec.js',
        'src/a.js',
      ]),
    ).toEqual([
      ['lib/a.js', true, true],
      ['lib/a.cjs', true, true],
      ['lib/legacy/old.js', false, false],
      ['spec/a.spec.js', true, true],
      ['src/a.js', false, false],
    ]);
  });
});
