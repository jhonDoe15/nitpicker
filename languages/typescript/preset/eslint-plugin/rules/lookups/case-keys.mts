import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import {
  resolveConstant,
  stringValue,
  type SourceContext,
} from '../analysis/constant-resolution.mts';
import { unwrapped } from '../typed/syntax-views.mts';

type Node = TSESTree.Node;
type ElementList = TSESTree.ArrayExpression['elements'];

const LOWER = 'lower';
const UPPER = 'upper';

export type Casing = typeof LOWER | typeof UPPER;

const NORMALIZERS = new Map<string, Casing>([
  ['toLowerCase', LOWER],
  ['toLocaleLowerCase', LOWER],
  ['toUpperCase', UPPER],
  ['toLocaleUpperCase', UPPER],
]);
const COLLECTION_CONSTRUCTORS = new Set(['Set', 'Map']);

export function normalizedKey(
  node: Node,
): { readonly casing: Casing; readonly inner: Node } | undefined {
  const call = unwrapped(node);
  if (
    call.type !== AST_NODE_TYPES.CallExpression ||
    call.callee.type !== AST_NODE_TYPES.MemberExpression
  ) {
    return undefined;
  }
  const { property } = call.callee;
  const casing =
    !call.callee.computed && property.type === AST_NODE_TYPES.Identifier
      ? NORMALIZERS.get(property.name)
      : undefined;
  return casing === undefined ? undefined : { casing, inner: call.callee.object };
}

export function hasCase(text: string, casing: Casing): boolean {
  return text !== (casing === LOWER ? text.toLowerCase() : text.toUpperCase());
}

function literalsOf(items: readonly (ElementList[number] | undefined)[]): string[] | undefined {
  const values = items.map((item) => {
    const present = item ?? undefined;
    return present === undefined ? undefined : stringValue(present);
  });
  return values.every((value) => value !== undefined) ? values : undefined;
}

function entryKey(entry: ElementList[number]): ElementList[number] | undefined {
  return entry?.type === AST_NODE_TYPES.ArrayExpression ? entry.elements[0] : undefined;
}

function constructed(node: TSESTree.NewExpression): string[] | undefined {
  const [first] = node.arguments;
  if (
    node.callee.type !== AST_NODE_TYPES.Identifier ||
    !COLLECTION_CONSTRUCTORS.has(node.callee.name)
  ) {
    return undefined;
  }
  if (first?.type !== AST_NODE_TYPES.ArrayExpression) {
    return undefined;
  }
  return node.callee.name === 'Map'
    ? literalsOf(first.elements.map(entryKey))
    : literalsOf(first.elements);
}

export function literalKeys(context: SourceContext, collection: Node): string[] | undefined {
  const resolved = unwrapped(resolveConstant(context, collection) ?? collection);
  if (resolved.type === AST_NODE_TYPES.ArrayExpression) {
    return literalsOf(resolved.elements);
  }
  return resolved.type === AST_NODE_TYPES.NewExpression ? constructed(resolved) : undefined;
}
