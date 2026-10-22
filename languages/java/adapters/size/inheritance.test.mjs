import { describe, expect, it } from 'vitest';
import { inheritanceDepths } from './inheritance.mjs';

const file = (packageName, imports = []) => ({ package: packageName, imports });
const klass = (path, name, extendsName) => ({
  file: path,
  name,
  ...(extendsName === undefined ? {} : { extends: extendsName }),
});

function depthsOf(files, classes) {
  const depths = inheritanceDepths({ files, classes });
  return Object.fromEntries(classes.map((entry) => [entry.name, depths.get(entry)]));
}

describe('inheritanceDepths', () => {
  it('counts a class without a superclass as 0 and a library superclass as 1', () => {
    const files = { 'A.java': file('a') };
    expect(
      depthsOf(files, [klass('A.java', 'Plain'), klass('A.java', 'Fails', 'RuntimeException')]),
    ).toEqual({ Plain: 0, Fails: 1 });
  });

  it('follows a chain through the same package, imports, wildcard imports and names in full', () => {
    const files = {
      'a/Base.java': file('a'),
      'a/Same.java': file('a'),
      'b/Imported.java': file('b', ['a.Base']),
      'c/Wild.java': file('c', ['a.*']),
      'd/Full.java': file('d'),
    };
    const classes = [
      klass('a/Base.java', 'Base', 'Object'),
      klass('a/Same.java', 'Same', 'Base'),
      klass('b/Imported.java', 'Imported', 'Base'),
      klass('c/Wild.java', 'Wild', 'Same'),
      klass('d/Full.java', 'Full', 'a.Same'),
    ];
    expect(depthsOf(files, classes)).toEqual({ Base: 1, Same: 2, Imported: 2, Wild: 3, Full: 3 });
  });

  it('resolves a nested superclass by its enclosing name and by Outer.Inner', () => {
    const files = { 'a/Outer.java': file('a'), 'a/User.java': file('a') };
    const classes = [
      klass('a/Outer.java', 'Outer'),
      klass('a/Outer.java', 'Outer.Inner', 'Outer'),
      klass('a/Outer.java', 'Outer.Sibling', 'Inner'),
      klass('a/User.java', 'User', 'Outer.Inner'),
    ];
    expect(depthsOf(files, classes)).toEqual({
      Outer: 0,
      'Outer.Inner': 1,
      'Outer.Sibling': 2,
      User: 2,
    });
  });

  it('does not loop on a cycle', () => {
    const files = { 'a/A.java': file('') };
    const classes = [klass('a/A.java', 'A', 'B'), klass('a/A.java', 'B', 'A')];
    expect(Object.values(depthsOf(files, classes)).every(Number.isFinite)).toBe(true);
  });
});
