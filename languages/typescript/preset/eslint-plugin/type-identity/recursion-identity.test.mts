import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { giveEachInstantiationItsOwnIdentity, startIdentityScope } from './recursion-identity.mjs';

function programOf(code: string) {
  const file = 'grid.ts';
  const host = ts.createCompilerHost({ noLib: true, types: [] });
  const readFile = host.readFile.bind(host);
  host.readFile = (name: string) => (name === file ? code : readFile(name));
  host.fileExists = (name: string) => name === file;
  return ts.createProgram({ rootNames: [file], options: { noLib: true, types: [] }, host });
}

function typesOf(program: ts.Program) {
  const checker = program.getTypeChecker();
  const source = program.getSourceFile('grid.ts');
  if (source === undefined) {
    throw new Error('grid.ts is not in the program');
  }
  return source.statements.map((statement) => {
    const declaration = ts.isVariableStatement(statement)
      ? statement.declarationList.declarations.at(0)
      : undefined;
    if (declaration === undefined) {
      throw new Error('grid.ts holds a statement that declares no variable');
    }
    return checker.getTypeAtLocation(declaration.name);
  });
}

function identityOf(checker: ts.TypeChecker, type: ts.Type | undefined): unknown {
  const method: unknown = Reflect.get(checker, 'getRecursionIdentity');
  if (typeof method !== 'function') {
    throw new TypeError('The checker has no getRecursionIdentity');
  }
  return Reflect.apply(method, checker, [type]);
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

    expect(typeof Reflect.get(checker, 'getRecursionIdentity')).toBe('function');
    expect(giveEachInstantiationItsOwnIdentity(program)).toBe(true);
    expect(giveEachInstantiationItsOwnIdentity(program)).toBe(false);
    expect(identityOf(checker, numberType)).toBe(identityOf(checker, numberType));
    expect(identityOf(checker, numberType)).not.toBe(identityOf(checker, stringType));
  });

  it('hands out new identities in each scope, so no cached result outlives its scope', () => {
    const program = programOf('export const n = 1;\n');
    const checker = program.getTypeChecker();
    const [type] = typesOf(program);
    giveEachInstantiationItsOwnIdentity(program);
    const before = identityOf(checker, type);

    startIdentityScope(program);

    expect(identityOf(checker, type)).not.toBe(before);
    expect(identityOf(checker, type)).toBe(identityOf(checker, type));
  });
});
