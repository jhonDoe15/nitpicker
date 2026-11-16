import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { memberName, unwrapped } from '../../security/security-values.mts';
import { chainOf } from '../../typed/node-views.mts';

type MaybeNode = TSESTree.Node | undefined;

export type Field = { readonly owner: TSESTree.Node; readonly name: string };
export type State = {
  readonly elements: Set<string>;
  readonly accumulators: Set<string | undefined>;
  destructured: Map<string, Field>;
  readonly fields: Field[];
  valid: boolean;
};
export const FIELD_METHODS: ReadonlySet<string | undefined> = new Set<string | undefined>([
  'localeCompare',
  'getTime',
  'valueOf',
  'startsWith',
  'endsWith',
  'includes',
  'toLowerCase',
  'toUpperCase',
]);

export function newState(elements: Set<string>, accumulators: Set<string | undefined>): State {
  return { elements, accumulators, destructured: new Map(), fields: [], valid: true };
}

export function rootOf(member: TSESTree.MemberExpression): {
  readonly root: TSESTree.Node;
  readonly first: TSESTree.MemberExpression;
  readonly computed: boolean;
  readonly chain: TSESTree.MemberExpression[];
} {
  const chain = chainOf<TSESTree.MemberExpression>(member, (current) => {
    const object = unwrapped(current.object);
    return object.type === AST_NODE_TYPES.MemberExpression ? object : undefined;
  });
  const first = chain.at(-1) ?? member;
  const computed = chain.some(
    (current) => current.computed && current.property.type !== AST_NODE_TYPES.Literal,
  );
  return { root: unwrapped(first.object), first, computed, chain };
}

function rootField(
  root: TSESTree.Node,
  first: TSESTree.MemberExpression,
  state: State,
): Field | undefined {
  if (root.type !== AST_NODE_TYPES.Identifier) {
    return undefined;
  }
  if (state.destructured.has(root.name)) {
    return state.destructured.get(root.name);
  }
  const name = memberName(first);
  return state.elements.has(root.name) && name !== undefined ? { owner: root, name } : undefined;
}

function plainFieldReceiver(node: TSESTree.Node): MaybeNode {
  if (node.type !== AST_NODE_TYPES.CallExpression || node.arguments.length !== 0) {
    return undefined;
  }
  const callee = unwrapped(node.callee);
  return callee.type === AST_NODE_TYPES.MemberExpression && FIELD_METHODS.has(memberName(callee))
    ? unwrapped(callee.object)
    : undefined;
}

export function fieldOf(node: TSESTree.Node, state: State): Field | undefined {
  const start = unwrapped(node);
  const target = chainOf<TSESTree.Node>(start, plainFieldReceiver).at(-1) ?? start;
  if (target.type === AST_NODE_TYPES.Identifier) {
    return state.destructured.get(target.name);
  }
  if (target.type !== AST_NODE_TYPES.MemberExpression) {
    return undefined;
  }
  const { root, first, computed } = rootOf(target);
  return computed ? undefined : rootField(root, first, state);
}
