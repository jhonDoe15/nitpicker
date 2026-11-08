import { describe, expect, it } from 'vitest';
import { goPackages } from './go-packages.mjs';

function file(path, name, { test = false, constrained = false } = {}) {
  return { path, package: name, test, generated: false, constrained };
}

const REPORT = {
  files: [
    file('main.go', 'main'),
    file('lib/a.go', 'lib'),
    file('lib/zgen.go', 'main', { constrained: true }),
    file('lib/a_test.go', 'lib_test', { test: true }),
    file('internal/store/store.go', 'store'),
    file('tools/gen.go', 'main', { constrained: true }),
  ],
};

describe('Go packages', () => {
  it('names a folder after the files every build compiles, not an ignored generator', () => {
    const packages = goPackages(REPORT, 'example.com/shop');

    expect(packages.directories.map((directory) => packages.nameOf(directory))).toEqual([
      'main',
      'store',
      'lib',
      'main',
    ]);
    expect(packages.mains).toEqual(['', 'tools']);
  });

  it('publishes library packages of a fetchable module outside internal folders', () => {
    const packages = goPackages(REPORT, 'example.com/shop');

    expect(packages.directories.filter((directory) => packages.isPublished(directory))).toEqual([
      'lib',
    ]);
    expect(goPackages(REPORT, 'shop').isPublished('lib')).toBe(false);
  });

  it('maps an import path of the module to its folder', () => {
    const packages = goPackages(REPORT, 'example.com/shop');

    expect(
      ['example.com/shop', 'example.com/shop/lib', 'example.com/shopping', 'fmt'].map((path) =>
        packages.directoryOfImport(path),
      ),
    ).toEqual(['', 'lib', undefined, undefined]);
  });
});
