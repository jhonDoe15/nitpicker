import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import type { FunctionNode } from '../../rules/typed/syntax-views.mts';
import type { SourceContext } from '../../rules/analysis/constant-resolution.mts';
import type { ModuleBindings } from '../../rules/analysis/subprocess-calls.mts';
import { chainOf, isNode } from '../../rules/typed/node-views.mts';

export type { FunctionNode };
export type Env = { readonly context: SourceContext; readonly bindings: FileBindings };
export type FileBindings = {
  readonly assertionNames: Set<string>;
  readonly expects: ModuleBindings;
  readonly timers: ModuleBindings;
  readonly callbacks: ModuleBindings;
  readonly asserts: ModuleBindings;
  readonly nodeTest: ModuleBindings;
  readonly rx: ModuleBindings;
};

const SHOULD = 'should';
const ASSERTION_ROOTS = new Set(['expect', 'assert', SHOULD]);
const NOT_ASSERTIONS = new Set([
  'any',
  'anything',
  'objectContaining',
  'arrayContaining',
  'stringContaining',
  'stringMatching',
  'closeTo',
  'extend',
  'addSnapshotSerializer',
  'addEqualityTesters',
  'getState',
  'setState',
  'assertions',
  'hasAssertions',
  'use',
  SHOULD,
]);
const CHAINED_ASSERTION_PROPERTIES = new Set(['assert', SHOULD, 'expect']);

export function inSet(set: ReadonlySet<string>, name: string | undefined): boolean {
  return name !== undefined && set.has(name);
}

export function propertyName(node: TSESTree.Node | undefined): string | undefined {
  if (node?.type !== AST_NODE_TYPES.MemberExpression) {
    return undefined;
  }
  if (!node.computed) {
    return node.property.type === AST_NODE_TYPES.Identifier ? node.property.name : undefined;
  }
  return node.property.type === AST_NODE_TYPES.Literal && typeof node.property.value === 'string'
    ? node.property.value
    : undefined;
}

function calleeLinks(callee: TSESTree.Node): TSESTree.Node[] {
  return chainOf(callee, (current) => {
    if (current.type === AST_NODE_TYPES.CallExpression) {
      return current.callee;
    }
    return current.type === AST_NODE_TYPES.MemberExpression ? current.object : undefined;
  });
}

export function rootName(node: TSESTree.Node): string | undefined {
  const root = calleeLinks(node).at(-1);
  if (root?.type === AST_NODE_TYPES.ThisExpression) {
    return 'this';
  }
  return root?.type === AST_NODE_TYPES.Identifier ? root.name : undefined;
}

function directMembers(links: readonly TSESTree.Node[]): (string | undefined)[] {
  const afterRoot = links.toReversed().slice(1);
  const firstCall = afterRoot.findIndex((link) => link.type === AST_NODE_TYPES.CallExpression);
  const direct = firstCall < 0 ? afterRoot : afterRoot.slice(0, firstCall);
  return direct.map((link) => propertyName(link));
}

function isAssertRoot(name: string, bindings: FileBindings): boolean {
  return (
    ASSERTION_ROOTS.has(name) ||
    ASSERTION_ROOTS.has(bindings.expects.named.get(name) ?? '') ||
    bindings.assertionNames.has(name) ||
    bindings.asserts.named.has(name) ||
    bindings.asserts.namespaces.has(name)
  );
}

export function isAssertion(
  node: TSESTree.Node,
  bindings: FileBindings,
): node is TSESTree.CallExpression {
  if (node.type !== AST_NODE_TYPES.CallExpression) {
    return false;
  }
  const links = calleeLinks(node.callee);
  const root = links.at(-1);
  if (root?.type !== AST_NODE_TYPES.Identifier || root.name === 'console') {
    return false;
  }
  if (isAssertRoot(root.name, bindings)) {
    return !directMembers(links).some((name) => name !== undefined && NOT_ASSERTIONS.has(name));
  }
  return links.some((link) => {
    const name = propertyName(link);
    return name !== undefined && CHAINED_ASSERTION_PROPERTIES.has(name);
  });
}

export function countsAsAssertion(node: TSESTree.Node, bindings: FileBindings): boolean {
  return (
    isAssertion(node, bindings) &&
    !calleeLinks(node.callee).some(
      (link) => link.type === AST_NODE_TYPES.CallExpression && isAssertion(link, bindings),
    )
  );
}

export function children(context: SourceContext, node: TSESTree.Node | undefined): TSESTree.Node[] {
  if (!node) {
    return [];
  }
  return (context.sourceCode.visitorKeys[node.type] ?? []).flatMap((key) => {
    const value: unknown = Reflect.get(node, key);
    return Array.isArray(value) ? value.filter(isNode) : [value].filter(isNode);
  });
}

function enterAll(): boolean {
  return true;
}

export function nodesIn(
  context: SourceContext,
  root: TSESTree.Node | undefined,
  enter: (node: TSESTree.Node) => boolean = enterAll,
): TSESTree.Node[] {
  const pending: TSESTree.Node[] = root !== undefined && enter(root) ? [root] : [];
  for (const node of pending) {
    for (const child of children(context, node).filter(enter)) {
      pending.push(child);
    }
  }
  return pending;
}
