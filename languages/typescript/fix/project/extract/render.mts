import type TypeScript from 'typescript';
import { chainOf, typescriptApi } from '../../../adapters/typed/typescript-program.mts';
import type { Hole, NamedHole } from './typed/extract-types.mts';
import { namedHoles } from './typed/typed-views.mts';
import { descendants } from './syntax.mts';

const ts = typescriptApi();

export function identifierTexts(sourceFile: TypeScript.SourceFile): Set<string> {
  return new Set(
    descendants(sourceFile)
      .filter(
        (node): node is TypeScript.Identifier | TypeScript.PrivateIdentifier =>
          ts.isIdentifier(node) || ts.isPrivateIdentifier(node),
      )
      .map(({ text }) => text),
  );
}

export function topLevelStatement(node: TypeScript.Node): TypeScript.Node {
  return (
    chainOf<TypeScript.Node>(node, ({ parent }) =>
      ts.isSourceFile(parent) ? undefined : parent,
    ).at(-1) ?? node
  );
}

function flowName(node: TypeScript.Node): string | undefined {
  const parent = node.parent;
  const named = ts.isVariableDeclaration(parent) || ts.isPropertyAssignment(parent);
  if (named && ts.isIdentifier(parent.name)) {
    return parent.name.text;
  }
  return ts.isIdentifier(node) ? node.text : undefined;
}

export function nameHoles(
  holes: readonly Hole[],
  taken: Iterable<string>,
): NamedHole[] | undefined {
  return namedHoles(holes, taken, flowName);
}

export function replacedText(
  range: { readonly start: number; readonly end: number },
  holes: readonly NamedHole[],
  sourceFile: TypeScript.SourceFile,
): string {
  const replacements = holes.flatMap((hole) =>
    hole.occurrences.map(({ a }) => ({
      start: a.getStart(sourceFile) - range.start,
      end: a.end - range.start,
      text: hole.kind === 'thunk' ? `${hole.name}()` : hole.name,
    })),
  );
  return replacements
    .toSorted((left, right) => right.start - left.start)
    .reduce(
      (text, { start, end, text: name }) => text.slice(0, start) + name + text.slice(end),
      sourceFile.text.slice(range.start, range.end),
    );
}

function typeString(checker: TypeScript.TypeChecker, type: TypeScript.Type): string {
  const flags = ts.TypeFormatFlags.NoTruncation;
  return checker.typeToString(checker.getBaseTypeOfLiteralType(type), undefined, flags);
}

export function symbolTypeString(
  checker: TypeScript.TypeChecker,
  symbol: TypeScript.Symbol | undefined,
): string {
  return symbol === undefined ? 'unknown' : typeString(checker, checker.getTypeOfSymbol(symbol));
}

function sideTypes(hole: Hole, checker: TypeScript.TypeChecker): string[] {
  return (['a', 'b'] as const).map((side) => {
    const node = hole.occurrences[0][side];
    return hole.kind === 'parameter'
      ? symbolTypeString(checker, checker.getSymbolAtLocation(node))
      : typeString(checker, checker.getTypeAtLocation(node));
  });
}

export function holeParameterText(
  hole: NamedHole,
  checker: TypeScript.TypeChecker,
  { typed }: { readonly typed: boolean },
): string {
  if (!typed) {
    return hole.name;
  }
  const types = [...new Set(sideTypes(hole, checker))];
  const joined = types.join(' | ');
  const type =
    hole.kind === 'thunk' ? `() => ${types.length > 1 ? `(${joined})` : joined}` : joined;
  return `${hole.name}: ${type}`;
}

export function holeArgumentText(
  hole: NamedHole,
  side: number,
  sourceFile: TypeScript.SourceFile,
): string {
  const node = hole.occurrences[0][side === 0 ? 'a' : 'b'];
  const text = node.getText(sourceFile);
  if (hole.kind !== 'thunk') {
    return text;
  }
  return ts.isObjectLiteralExpression(node) ? `() => (${text})` : `() => ${text}`;
}
