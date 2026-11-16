import { describe, expect, it } from 'vitest';
import { byCodeUnits } from '../../../../../core/scope/mutation-scope.mjs';
import { affectedModules } from './affected-modules.mjs';

const MODULES = [
  { dir: '.', hasSources: false, requires: [] },
  { dir: 'core', hasSources: true, requires: [] },
  { dir: 'orders', hasSources: true, requires: ['core'] },
  { dir: 'billing', hasSources: true, requires: ['core'] },
  { dir: 'web', hasSources: true, requires: ['orders', 'billing'] },
  { dir: 'tools', hasSources: true, requires: [] },
];

function affected(changedFiles, modules = MODULES) {
  const result = affectedModules({ modules, changedFiles });
  return result === undefined ? undefined : [...result].toSorted(byCodeUnits);
}

describe('affectedModules', () => {
  it('is the module with a changed file when nothing depends on it', () => {
    expect(affected(['tools/src/main/java/demo/Tool.java'])).toEqual(['tools']);
  });

  it('adds every module that depends on the changed one, directly or through another', () => {
    expect(affected(['core/src/main/java/demo/Core.java'])).toEqual([
      'billing',
      'core',
      'orders',
      'web',
    ]);
    expect(affected(['orders/src/test/java/demo/OrdersTest.java'])).toEqual(['orders', 'web']);
  });

  it('counts any file inside a module, and takes the module that is the deepest match', () => {
    const nested = [...MODULES, { dir: 'orders/api', hasSources: true, requires: [] }];

    expect(affected(['orders/pom.xml'], nested)).toEqual(['orders', 'web']);
    expect(affected(['orders/api/pom.xml'], nested)).toEqual(['orders/api']);
  });

  it('merges the modules of several changed files', () => {
    expect(affected(['tools/a.txt', 'billing/b.txt'])).toEqual(['billing', 'tools', 'web']);
  });

  it('cannot be computed when a file belongs to no module', () => {
    expect(affected(['pom.xml'])).toBeUndefined();
    expect(affected(['config/checkstyle.xml', 'tools/a.txt'])).toBeUndefined();
    expect(affected(['src/main/java/demo/Root.java'])).toBeUndefined();
  });

  it('counts the sources of a root module that has some', () => {
    const rooted = MODULES.map((module) =>
      module.dir === '.' ? { ...module, hasSources: true } : module,
    );

    expect(affected(['src/main/java/demo/Root.java'], rooted)).toEqual(['.']);
    expect(affected(['README.md'], rooted)).toBeUndefined();
  });

  it('cannot be computed without a known change', () => {
    expect(affected(undefined)).toBeUndefined();
    expect(affected([])).toBeUndefined();
  });
});
