import { describe, expect, it } from 'vitest';
import { PROJECT, useTempProjects } from '../test-support/temp-projects.mts';
import { mainSourceTypes } from './declarations.mts';
import { indexOf } from './type-index.mts';
import type { TypeDecl } from './types.mts';

const projectWith = useTempProjects('nitpicker-type-declarations-');

function typesOf(files: Readonly<Record<string, string>>): TypeDecl[] {
  const root = projectWith(
    Object.fromEntries(
      Object.entries(files).map(([name, text]) => [`src/main/java/${name}.java`, text]),
    ),
  );
  return mainSourceTypes(root, { projects: [PROJECT], kotlin: false }).flatMap(
    ({ types }) => types,
  );
}

function named(types: readonly TypeDecl[], name: string): TypeDecl {
  const found = types.find((type) => type.name === name);
  if (found === undefined) {
    throw new Error(`no type ${name}`);
  }
  return found;
}

const NESTED = `package a;
class Outer {
  static class Inner {
    static class Deep {}
  }
  static class Sibling {}
}
`;

describe('indexOf', () => {
  it('resolves a member type from the type that holds it, a sibling and a type nested deeper', () => {
    const types = typesOf({ 'a/Outer': NESTED });
    const index = indexOf(types);
    const [outer, inner, deep, sibling] = ['Outer', 'Inner', 'Deep', 'Sibling'].map((name) =>
      named(types, name),
    );

    expect(index.resolve('Inner', named(types, 'Outer'))).toBe(inner);
    expect(index.resolve('Sibling', named(types, 'Inner'))).toBe(sibling);
    expect(index.resolve('Sibling', named(types, 'Deep'))).toBe(sibling);
    expect(index.resolve('Deep', named(types, 'Sibling'))).toBeUndefined();
    expect(index.resolve('Outer.Inner.Deep', named(types, 'Sibling'))).toBe(deep);
    expect(index.resolve('a.Outer', named(types, 'Deep'))).toBe(outer);
    expect(index.resolve('Missing.Inner', named(types, 'Outer'))).toBeUndefined();
  });

  it('leaves a qualified name that two declarations share unresolved', () => {
    const types = typesOf({
      'b/Dup': 'package b;\nclass Dup {}\n',
      'c/Dup': 'package b;\nclass Dup {}\n',
      'b/User': 'package b;\nclass User {}\n',
    });

    expect(indexOf(types).resolve('b.Dup', named(types, 'User'))).toBeUndefined();
  });
});

describe('mainSourceTypes', () => {
  it('reads wildcard imports, skips a stray semicolon and an empty part of the header', () => {
    const types = typesOf({
      'd/Odd': `package d;
import java.util.*;
class Odd implements , Runnable {
  ;
  int count;
  public void run() {}
}
`,
    });
    const odd = named(types, 'Odd');

    expect(odd.imports).toEqual(['java.util.*']);
    expect(odd.interfaces).toEqual(['Runnable']);
    expect(odd.fields.map(({ name }) => name)).toEqual(['count']);
  });
});
