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

  it('leaves out roots outside the project and falls back to the module folder', () => {
    expect(rootsScope(['app/src/main/java', '../shared/src/main/java'], 'app')).toEqual([
      'app/src/main/java',
    ]);
    expect(rootsScope(['../shared/src', '/opt/src', 'C:/src', '..'], 'app')).toEqual(['app']);
    expect(rootsScope([], 'services/app')).toEqual(['services/app']);
    expect(rootsScope([], '')).toEqual(['.']);
  });
});
