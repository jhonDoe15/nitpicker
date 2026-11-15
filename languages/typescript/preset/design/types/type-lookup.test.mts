import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { normalizedTypeText, withoutGenerics } from './type-lookup.mts';

function typeOfText(typeText: string) {
  const source = `declare const probe: ${typeText};`;
  const host = ts.createCompilerHost({});
  const original = host.getSourceFile.bind(host);
  host.getSourceFile = (name, ...rest) =>
    name === 'probe.ts'
      ? ts.createSourceFile(name, source, ts.ScriptTarget.ESNext, true)
      : original(name, ...rest);
  host.fileExists = (name) => name === 'probe.ts' || ts.sys.fileExists(name);
  const program = ts.createProgram(['probe.ts'], { strict: true, noLib: true }, host);
  const checker = program.getTypeChecker();
  const declaration = program.getSourceFile('probe.ts')?.statements.at(-1);
  const probe =
    declaration !== undefined && ts.isVariableStatement(declaration)
      ? declaration.declarationList.declarations[0]
      : undefined;
  if (probe === undefined) {
    throw new Error('the probe declaration is missing');
  }
  return { checker, type: checker.getTypeAtLocation(probe.name) };
}

describe('withoutGenerics', () => {
  it.each([
    ['Map<string, number>', 'Map'],
    ['Array<Array<number>>', 'Array'],
    ['(value: number) => void', '(value: number) => void'],
    ['Promise<Record<string, () => void>>[]', 'Promise[]'],
    ['plain', 'plain'],
  ])('reduces %s to %s', (text, expected) => {
    expect(withoutGenerics(text)).toBe(expected);
  });
});

describe('normalizedTypeText', () => {
  it.each([
    ['string | undefined', 'string'],
    ['{ a: number } | undefined', '{a:number;}'],
    ['undefined', 'undefined'],
    ['"x" | "y"', '"x"|"y"'],
  ])('writes the type %s as %s', (typeText, expected) => {
    const { checker, type } = typeOfText(typeText);

    expect(normalizedTypeText(checker, type)).toBe(expected);
  });
});
