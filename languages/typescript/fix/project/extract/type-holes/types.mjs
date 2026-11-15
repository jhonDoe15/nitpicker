import {
  recordTypeHole,
  typePairProblem,
} from '../../../../../../shared/fix/recipes/extract/bijection.mjs';
import { ts } from '../../../../typescript-api/typescript-api.mjs';
import { normalizedText } from '../syntax.mjs';

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
const LISTS = [
  { test: ts.isUnionTypeNode, listOf: (node) => [...node.types] },
  { test: ts.isIntersectionTypeNode, listOf: (node) => [...node.types] },
  { test: ts.isTupleTypeNode, listOf: (node) => [...node.elements] },
  { test: ts.isArrayTypeNode, listOf: (node) => [node.elementType] },
  { test: ts.isParenthesizedTypeNode, listOf: (node) => [node.type] },
];

function isTypeOnly(node) {
  return ts.isTypeNode(node) && !ts.isExpression(node);
}

function zipped(left, right) {
  return left.length === right.length ? left.map((node, index) => [node, right[index]]) : undefined;
}

function listParts(x, y) {
  const spec = LISTS.find(({ test }) => test(x) && test(y));
  return spec === undefined ? undefined : zipped(spec.listOf(x), spec.listOf(y));
}

function referenceParts(x, y, sourceFile) {
  const both = ts.isTypeReferenceNode(x) && ts.isTypeReferenceNode(y);
  const same =
    both && normalizedText(x.typeName, sourceFile) === normalizedText(y.typeName, sourceFile);
  return same && x.typeArguments !== undefined && y.typeArguments !== undefined
    ? zipped([...x.typeArguments], [...y.typeArguments])
    : undefined;
}

function isSimple(node) {
  if (SIMPLE_KEYWORDS.has(node.kind)) {
    return true;
  }
  return (
    ts.isTypeReferenceNode(node) &&
    ts.isIdentifier(node.typeName) &&
    node.typeArguments === undefined
  );
}

function expand(env, [x, y], pending) {
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

export function typePairStep(env, x, y) {
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
