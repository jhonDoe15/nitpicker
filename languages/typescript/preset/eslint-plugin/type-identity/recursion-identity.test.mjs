import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { giveEachInstantiationItsOwnIdentity, startIdentityScope } from './recursion-identity.mjs';

function programOf(code) {
  const file = 'grid.ts';
  const host = ts.createCompilerHost({ noLib: true, types: [] });
  const readFile = host.readFile.bind(host);
  host.readFile = (name) => (name === file ? code : readFile(name));
  host.fileExists = (name) => name === file;
  return ts.createProgram({ rootNames: [file], options: { noLib: true, types: [] }, host });
}

function typesOf(program) {
  const checker = program.getTypeChecker();
  return program
    .getSourceFile('grid.ts')
    .statements.map((statement) =>
      checker.getTypeAtLocation(statement.declarationList.declarations[0].name),
    );
}

describe('giveEachInstantiationItsOwnIdentity', () => {
  it('leaves a checker without the internal recursion identity untouched', () => {
    const checker = {};

    expect(giveEachInstantiationItsOwnIdentity({ getTypeChecker: () => checker })).toBe(false);
    startIdentityScope({ getTypeChecker: () => checker });
    startIdentityScope(undefined);
    expect(checker).toEqual({});
    expect(giveEachInstantiationItsOwnIdentity(undefined)).toBe(false);
  });

  it('patches the TypeScript checker once, giving each shallow type its own identity', () => {
    const program = programOf('export const n = 1;\nexport const s = "s";\n');
    const checker = program.getTypeChecker();
    const [numberType, stringType] = typesOf(program);

    expect(typeof checker.getRecursionIdentity).toBe('function');
    expect(giveEachInstantiationItsOwnIdentity(program)).toBe(true);
    expect(giveEachInstantiationItsOwnIdentity(program)).toBe(false);
    expect(checker.getRecursionIdentity(numberType)).toBe(checker.getRecursionIdentity(numberType));
    expect(checker.getRecursionIdentity(numberType)).not.toBe(
      checker.getRecursionIdentity(stringType),
    );
  });

  it('hands out new identities in each scope, so no cached result outlives its scope', () => {
    const program = programOf('export const n = 1;\n');
    const checker = program.getTypeChecker();
    const [type] = typesOf(program);
    giveEachInstantiationItsOwnIdentity(program);
    const before = checker.getRecursionIdentity(type);

    startIdentityScope(program);

    expect(checker.getRecursionIdentity(type)).not.toBe(before);
    expect(checker.getRecursionIdentity(type)).toBe(checker.getRecursionIdentity(type));
  });
});
