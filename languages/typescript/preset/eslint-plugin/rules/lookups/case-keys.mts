import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import {
  resolveConstant,
  stringValue,
  type SourceContext,
} from '../analysis/constant-resolution.mts';
import { unwrapped } from '../typed/syntax-views.mts';

type Node = TSESTree.Node;
export type Casing = 'lower' | 'upper';

const NORMALIZERS = new Map<string, Casing>([
  ['toLowerCase', 'lower'],
  ['toLocaleLowerCase', 'lower'],
  ['toUpperCase', 'upper'],
  ['toLocaleUpperCase', 'upper'],
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
  return text !== (casing === 'lower' ? text.toLowerCase() : text.toUpperCase());
}

function literalsOf(items: readonly (Node | null)[]): string[] | undefined {
  const values = items.map((item) => (item === null ? undefined : stringValue(item)));
  return values.every((value) => value !== undefined) ? (values as string[]) : undefined;
}

function entryKey(entry: Node | null): Node | null {
  return entry?.type === AST_NODE_TYPES.ArrayExpression ? (entry.elements[0] ?? null) : null;
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
