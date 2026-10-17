import { describe, expect, it } from 'vitest';
import { javaFolderDepthFindings } from './folder-depth.mjs';

const source = (packagePath, name = 'A.java') => ({
  path: `src/main/java/${packagePath}/${name}`,
  packagePath,
  kind: 'source',
});
const findings = (entries, options = {}) =>
  javaFolderDepthFindings(entries, { analyzerName: 'structure', ...options });

describe('Java folder depth', () => {
  it('allows 4 package levels below the root package, the packages all the code shares', () => {
    const shop = 'com/example/shop';
    expect(findings([source(shop), source(`${shop}/a/b/c/d`), source(`${shop}/other`)])).toEqual(
      [],
    );
    const [finding] = findings([source(shop), source(`${shop}/a/b/c/d/e`)]);
    expect({ rule: finding.rule, path: finding.path, identity: finding.identity }).toEqual({
      rule: 'folder-depth-limit',
      path: 'src/main/java/com/example/shop/a/b/c/d/e',
      identity: 'folder-depth:source:5',
    });
    expect(finding.message).toBe(
      'Package is 5 levels below the root package (limit 4). Keep packages at most 4 levels below the root package: group by responsibility instead of nesting. If a reviewer agrees this is intended, add {"rule":"folder-depth-limit","paths":["src/main/java/com/example/shop/a/b/c/d/e/**"],"reason":"<why this is intended>"} to "exceptions" in nitpicker.config.json.',
    );
  });

  it('takes the root from every file, so a single deep package is its own root', () => {
    expect(findings([source('com/example/shop/orders/a/b/c/d/e')])).toEqual([]);
    expect(findings([source('x/a/b/c/d/e'), source('y')])).toHaveLength(1);
  });

  it('lets default-package files and module and package descriptors leave the root alone', () => {
    const shop = 'com/example/shop';
    const legacy = [source(shop), source(`${shop}/a/b/c/d`)];
    expect(findings([...legacy, source('', 'Main.java')])).toEqual([]);
    expect(findings([...legacy, source('', 'module-info.java')])).toEqual([]);
    expect(findings([...legacy, source('com/example', 'package-info.java')])).toEqual([]);
    expect(findings([source('', 'Main.java'), source('a/b/c/d/e')])).toEqual([]);
  });

  it('takes the limit from thresholds and lifts the rule for the paths an exception names', () => {
    const entries = [source('r'), source('r/a/b')];
    expect(findings(entries, { thresholds: { folderDepth: 1 } })).toHaveLength(1);
    expect(findings(entries, { thresholds: { folderDepth: 2 } })).toEqual([]);
    expect(
      findings(entries, {
        thresholds: { folderDepth: 1 },
        exceptions: [{ rule: 'folder-depth-limit', paths: ['src/main/java/r/a/**'] }],
      }),
    ).toEqual([]);
  });

  it('keeps the root of the base when the branch adds a package outside it', () => {
    const shop = 'com/example/shop';
    const base = [source(shop), source(`${shop}/a/b/c/d`)];
    const head = [...base, source('db/migration')];
    expect(findings(head).map(({ path: found }) => found)).toEqual([
      'src/main/java/com/example/shop/a/b/c/d',
    ]);
    expect(findings(head, { rootEntries: base })).toEqual([]);
    expect(findings([...head, source('db/migration/a/b/c/d')], { rootEntries: base })).toHaveLength(
      1,
    );
  });

  it('has nothing to check without code', () => {
    expect(findings([])).toEqual([]);
  });
});
