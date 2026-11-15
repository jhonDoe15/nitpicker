import type TypeScript from 'typescript';
import { typescriptApi } from '../../../../adapters/typed/typescript-program.mts';
import { normalizedText } from '../syntax.mts';
import type { AlignEnv, Both } from '../typed/extract-types.mts';
import { recordTypeHole, typePairProblem } from '../typed/typed-views.mts';

const ts = typescriptApi();

const DIFFERENT = 'the copies use different types';
export const NOT_A_TYPE = Symbol('not a type');
const SIMPLE_KEYWORDS = new Set([
  ts.SyntaxKind.StringKeyword,
  ts.SyntaxKind.NumberKeyword,
  ts.SyntaxKind.BooleanKeyword,
  ts.SyntaxKind.BigIntKeyword,
  ts.SyntaxKind.SymbolKeyword,
  ts.SyntaxKind.ObjectKeyword,
  ts.SyntaxKind.AnyKeyword,
  ts.SyntaxKind.UnknownKeyword,
]);

type TypeList = {
  readonly test: (node: TypeScript.Node) => boolean;
  readonly listOf: (node: TypeScript.Node) => TypeScript.Node[];
};

function listSpec<N extends TypeScript.Node>(
  test: (node: TypeScript.Node) => node is N,
  listOf: (node: N) => TypeScript.Node[],
): TypeList {
  return { test, listOf: (node) => (test(node) ? listOf(node) : []) };
}

const LISTS: readonly TypeList[] = [
  listSpec(ts.isUnionTypeNode, (node) => [...node.types]),
  listSpec(ts.isIntersectionTypeNode, (node) => [...node.types]),
  listSpec(ts.isTupleTypeNode, (node) => [...node.elements]),
  listSpec(ts.isArrayTypeNode, (node) => [node.elementType]),
  listSpec(ts.isParenthesizedTypeNode, (node) => [node.type]),
];

function isTypeOnly(node: TypeScript.Node): boolean {
  return ts.isTypeNode(node) && !ts.isExpression(node);
}

function zipped(
  left: readonly TypeScript.Node[],
  right: readonly TypeScript.Node[],
): Both<TypeScript.Node>[] | undefined {
  return left.length === right.length
    ? left.flatMap((node, index) => {
        const other = right[index];
        return other === undefined ? [] : [[node, other] as const];
      })
    : undefined;
}

function listParts(x: TypeScript.Node, y: TypeScript.Node): Both<TypeScript.Node>[] | undefined {
  const spec = LISTS.find(({ test }) => test(x) && test(y));
  return spec === undefined ? undefined : zipped(spec.listOf(x), spec.listOf(y));
}

function referenceParts(
  x: TypeScript.Node,
  y: TypeScript.Node,
  sourceFile: TypeScript.SourceFile,
): Both<TypeScript.Node>[] | undefined {
  if (!(ts.isTypeReferenceNode(x) && ts.isTypeReferenceNode(y))) {
    return undefined;
  }
  const same = normalizedText(x.typeName, sourceFile) === normalizedText(y.typeName, sourceFile);
  return same && x.typeArguments !== undefined && y.typeArguments !== undefined
    ? zipped([...x.typeArguments], [...y.typeArguments])
    : undefined;
}

function isSimple(node: TypeScript.Node): boolean {
  if (SIMPLE_KEYWORDS.has(node.kind)) {
    return true;
  }
  return (
    ts.isTypeReferenceNode(node) &&
    ts.isIdentifier(node.typeName) &&
    node.typeArguments === undefined
  );
}

function expand(
  env: AlignEnv,
  [x, y]: Both<TypeScript.Node>,
  pending: Both<TypeScript.Node>[],
): string | undefined {
  const texts = [x, y].map((node) => normalizedText(node, env.sourceFile));
  if (texts[0] === texts[1]) {
    return undefined;
  }
  const parts = listParts(x, y) ?? referenceParts(x, y, env.sourceFile);
  if (parts !== undefined) {
    pending.push(...parts);
    return undefined;
  }
  if (!(isSimple(x) && isSimple(y))) {
    return DIFFERENT;
  }
  recordTypeHole(env.holes, [x, y], texts);
  return undefined;
}

export function typePairStep(
  env: AlignEnv,
  x: TypeScript.Node,
  y: TypeScript.Node,
): string | undefined | typeof NOT_A_TYPE {
  if (env.typeHoles && isTypeOnly(x) && isTypeOnly(y)) {
    return typePairProblem(env.typeSites, [x, y], {
      textOf: (node) => normalizedText(node, env.sourceFile),
      expand: (pair, pending) => expand(env, pair, pending),
    });
  }
  if (x.kind === y.kind && ts.isTypeNode(x)) {
    return normalizedText(x, env.sourceFile) === normalizedText(y, env.sourceFile)
      ? undefined
      : DIFFERENT;
  }
  return NOT_A_TYPE;
}
