import { describe, expect, it } from 'vitest';
import { inModule, rootsScope } from './module-path.mjs';

describe('inModule', () => {
  it('puts a module-relative path under the module path, and leaves a root module path alone', () => {
    expect(inModule('core', 'src/test/java/A.java')).toBe('core/src/test/java/A.java');
    expect(inModule('services/core', '.')).toBe('services/core');
    expect(inModule('', 'src/A.java')).toBe('src/A.java');
    expect(inModule(undefined, '.')).toBe('.');
  });
});

describe('rootsScope', () => {
  it('lists each source root once, reads a root equal to the module as the whole module', () => {
    expect(rootsScope(['src/main/java', 'src/test/java', 'src/main/java'])).toEqual([
      'src/main/java',
      'src/test/java',
    ]);
    expect(rootsScope(['', 'src/test/java'])).toEqual(['.', 'src/test/java']);
    expect(rootsScope(['./', 'src\\main\\java\\'])).toEqual(['.', 'src/main/java']);
    expect(rootsScope([])).toEqual(['.']);
  });

  it('leaves out roots outside the project, and scopes nothing when none is left', () => {
    expect(
      rootsScope(['app/src/main/java', '../shared/src/main/java'], { moduleDir: 'app' }),
    ).toEqual(['app/src/main/java']);
    expect(
      rootsScope(['../shared/src', '/opt/src', 'C:/src', '\\\\host\\src', '..'], {
        moduleDir: 'app',
      }),
    ).toEqual([]);
    expect(rootsScope(['../x/src/main/java'], { moduleDir: '../x' })).toEqual([]);
  });

  it('scopes a module without source roots to its folder when that lies in the project', () => {
    expect(rootsScope([], { moduleDir: 'services/app' })).toEqual(['services/app']);
    expect(rootsScope([], { moduleDir: '' })).toEqual(['.']);
    expect(rootsScope([], { modulePath: 'platform' })).toEqual(['platform']);
    expect(rootsScope([], { moduleDir: '/abs/module' })).toEqual([]);
    expect(rootsScope([], { moduleDir: '../x' })).toEqual([]);
  });

  it('places module-relative roots under the module path before it filters them', () => {
    expect(
      rootsScope(['src/main/java', '../shared/src', '../../outside/src'], { modulePath: 'app' }),
    ).toEqual(['app/src/main/java', 'shared/src']);
    expect(rootsScope(['./', '..\\common\\src\\'], { modulePath: 'services/app' })).toEqual([
      'services/app',
      'services/common/src',
    ]);
    expect(rootsScope(['/opt/src', '../../shared/src'], { modulePath: 'platform' })).toEqual([]);
  });
});
