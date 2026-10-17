import { describe, expect, it } from 'vitest';
import { createPolicyScope, rootSets } from '../policy-scope.mjs';
import { hiddenCodeChanges } from './hidden-code.mjs';

const BASE_FILES = ['src/orders/total.ts', 'src/vendor/lib.ts', 'src/legacy/old.ts'];
const vendor = { exclude: ['src/vendor/**'] };

function hidden(baseConfig, headConfig, { files, baseFiles = BASE_FILES, imports = {}, moves }) {
  const scope = createPolicyScope({
    files,
    baseFiles,
    baseRoots: rootSets(baseConfig, '.'),
    headRoots: rootSets(headConfig, '.'),
    headConfig,
    moves,
    reach: () => new Map(Object.entries(imports)),
  });
  return hiddenCodeChanges(baseConfig, headConfig, scope).loosened.map(({ text }) => text);
}

describe('hiddenCodeChanges', () => {
  it('fails new code under a glob the base did not have, wherever the file is', () => {
    expect(
      hidden({}, { exclude: ['lib/**'] }, { files: [...BASE_FILES, 'lib/feature.ts'] }),
    ).toEqual([
      'exclude and layout.excludedGlobs hide code this change adds or moves where the base config checked it: lib/feature.ts',
    ]);
  });

  it('judges each file by the base globs, so a respelled or re-keyed glob behaves like the original', () => {
    const files = [...BASE_FILES, 'src/vendor/feature.ts', 'src/vendor/extra.ts'];
    const imports = { 'src/vendor/feature.ts': 'src/orders/total.ts' };

    expect(hidden(vendor, { exclude: ['src/vendor/**/*'] }, { files, imports })).toEqual([
      'exclude and layout.excludedGlobs hide code this change adds or moves that production code imports: src/vendor/feature.ts (imported by src/orders/total.ts)',
    ]);
    expect(hidden(vendor, { layout: { excludedGlobs: ['src/vendor/**'] } }, { files })).toEqual([]);
  });

  it('fails code under a glob that hid no base code, however it is spelled now', () => {
    const later = (paths) => ({
      exceptions: [{ rule: 'file-lines-limit', paths, reason: 'Generated' }],
    });

    expect(
      hidden(later(['src/later/**']), later(['src/later/**/*']), {
        files: [...BASE_FILES, 'src/later/big.ts'],
      }),
    ).toEqual([
      'exceptions for file-lines-limit hide code this change adds or moves where the base hid no code: src/later/big.ts',
    ]);
  });

  it('calls a glob established from the base snapshot, so replacing every vendored file passes', () => {
    expect(
      hidden(vendor, vendor, { files: ['src/orders/total.ts', 'src/vendor/lib-v2.ts'] }),
    ).toEqual([]);
  });

  it('passes new code under an established test root unless production imports it, and fails code moved there', () => {
    const legacy = { layout: { testRoots: ['test', 'tests', 'src/legacy'] } };
    const files = [...BASE_FILES, 'src/legacy/helper.ts'];
    const moves = { files: new Map([['src/orders/total.ts', 'src/legacy/total.ts']]) };

    expect(hidden(legacy, legacy, { files })).toEqual([]);
    expect(
      hidden(legacy, legacy, { files, imports: { 'src/legacy/helper.ts': 'src/orders/total.ts' } }),
    ).toEqual([
      'layout.testRoots hide code this change adds or moves that production code imports: src/legacy/helper.ts (imported by src/orders/total.ts)',
    ]);
    expect(
      hidden(legacy, legacy, {
        files: ['src/legacy/total.ts', 'src/vendor/lib.ts', 'src/legacy/old.ts'],
        moves,
      }),
    ).toEqual([
      'layout.testRoots hide code this change adds or moves where the base config checked it: src/legacy/total.ts',
    ]);
  });

  it('keeps every file in the key and cuts the text after three', () => {
    const files = ['a', 'b', 'c', 'd'].map((name) => `lib/${name}.ts`);
    const scope = createPolicyScope({
      files,
      baseFiles: [],
      baseRoots: {},
      headRoots: rootSets({}, '.'),
      headConfig: { exclude: ['lib/**'] },
    });
    const [entry] = hiddenCodeChanges({}, { exclude: ['lib/**'] }, scope).loosened;

    expect(entry.text.endsWith('lib/a.ts, lib/b.ts, lib/c.ts, and 1 more')).toBe(true);
    expect(entry.key.endsWith('lib/a.ts, lib/b.ts, lib/c.ts, lib/d.ts')).toBe(true);
    expect(entry.files).toEqual(files);
  });
});
