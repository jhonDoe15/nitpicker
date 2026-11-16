import type TypeScript from 'typescript';
import { chainOf, typescriptApi } from '../../../adapters/typed/typescript-program.mts';
import type { Hole, NamedHole } from './typed/extract-types.mts';
import { nameHoles as sharedNameHoles, withReplacements } from './typed/typed-views.mts';
import { descendants } from './syntax.mts';
import { TYPE_PARAMETER_NAMES } from '../../../../../shared/fix/recipes/extract/names.mjs';

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
  return sharedNameHoles(holes, taken, (hole) => flowName(hole.occurrences[0].a));
}

const TYPE_NAMES: readonly string[] = TYPE_PARAMETER_NAMES;

export function nameTypeHoles(
  holes: readonly Hole[],
  taken: ReadonlySet<string>,
): NamedHole[] | undefined {
  const free = TYPE_NAMES.filter((name) => !taken.has(name));
  if (holes.length > free.length) {
    return undefined;
  }
  return holes.flatMap((hole, index) => {
    const name = free[index];
    return name === undefined ? [] : [{ ...hole, name }];
  });
}

export function typeArgumentText(
  hole: Hole,
  side: 0 | 1,
  sourceFile: TypeScript.SourceFile,
): string {
  return hole.occurrences[0][side === 0 ? 'a' : 'b'].getText(sourceFile).replaceAll(/\s+/gu, ' ');
}

export function replacedText(
  range: { readonly start: number; readonly end: number },
  holes: readonly NamedHole[],
  sourceFile: TypeScript.SourceFile,
): string {
  const replacements = holes.flatMap((hole) =>
    hole.occurrences
      .filter(({ a }) => a.getStart(sourceFile) >= range.start && a.end <= range.end)
      .map(({ a }) => ({
        start: a.getStart(sourceFile) - range.start,
        end: a.end - range.start,
        text: hole.kind === 'thunk' ? `${hole.name}()` : hole.name,
      })),
  );
  return withReplacements(sourceFile.text.slice(range.start, range.end), replacements);
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
