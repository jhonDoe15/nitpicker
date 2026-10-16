import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { giveEachInstantiationItsOwnIdentity } from './recursion-identity.mjs';

function programOf(code) {
  const file = 'grid.ts';
  const host = ts.createCompilerHost({ noLib: true, types: [] });
  const readFile = host.readFile.bind(host);
  host.readFile = (name) => (name === file ? code : readFile(name));
  host.fileExists = (name) => name === file;
  return ts.createProgram({ rootNames: [file], options: { noLib: true, types: [] }, host });
}

describe('giveEachInstantiationItsOwnIdentity', () => {
  it('leaves a checker without the internal recursion identity untouched', () => {
    const checker = {};

    expect(giveEachInstantiationItsOwnIdentity({ getTypeChecker: () => checker })).toBe(false);
    expect(checker).toEqual({});
    expect(giveEachInstantiationItsOwnIdentity(undefined)).toBe(false);
  });

  it('patches the TypeScript checker once, keeping a shallow type its own identity', () => {
    const program = programOf('export type Box<T> = { readonly value: T };\nexport const n = 1;\n');
    const checker = program.getTypeChecker();
    const type = checker.getTypeAtLocation(program.getSourceFile('grid.ts').statements[1]);

    expect(typeof checker.getRecursionIdentity).toBe('function');
    expect(giveEachInstantiationItsOwnIdentity(program)).toBe(true);
    expect(giveEachInstantiationItsOwnIdentity(program)).toBe(false);
    expect(checker.getRecursionIdentity(type)).toBe(type);
  });
});
