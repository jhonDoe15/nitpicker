import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import {
  isFunctionNode,
  resolveConstant,
  resolveFunction,
} from '../analysis/constant-resolution.mts';
import { appendAll } from '../../../../../../shared/lists/lists.mts';
import type { Context } from '../security/security-values.mts';
import { ancestorsOf, nameOf, nodeChildren } from '../typed/node-views.mts';

export type Problem = {
  readonly kind: 'empty' | 'lookup' | 'unmapped';
  readonly node: TSESTree.Node;
};

const ROW_METHODS = new Set(['find', 'findMany', 'findAll', 'findBy', 'findByIds', 'getRawMany']);
const MAX_DERIVATION = 3;
const LOOKUPS = new Set(['get', 'find']);
const PROMISE_WRAPPERS = new Set(['all', 'resolve']);

function unwrapOnce(node: TSESTree.Node): TSESTree.Node | undefined {
  if (node.type === AST_NODE_TYPES.AwaitExpression) {
    return node.argument;
  }
  if (
    node.type === AST_NODE_TYPES.TSAsExpression ||
    node.type === AST_NODE_TYPES.TSSatisfiesExpression
  ) {
    return node.expression;
  }
  const [only] = node.type === AST_NODE_TYPES.CallExpression ? node.arguments : [];
  const isWrapper =
    node.type === AST_NODE_TYPES.CallExpression &&
    node.callee.type === AST_NODE_TYPES.MemberExpression &&
    nameOf(node.callee.object) === 'Promise' &&
    PROMISE_WRAPPERS.has(nameOf(node.callee.property) ?? '') &&
    node.arguments.length === 1;
  return isWrapper ? only : undefined;
}

function unwrapValue(node: TSESTree.Node): TSESTree.Node {
  const chain = [node];
  for (const current of chain) {
    const next = unwrapOnce(current);
    if (next === undefined) {
      return current;
    }
    chain.push(next);
  }
  return node;
}

function methodOf(call: TSESTree.CallExpression): string | undefined {
  return call.callee.type === AST_NODE_TYPES.MemberExpression
    ? nameOf(call.callee.property)
    : undefined;
}

function isRowQuery(call: TSESTree.CallExpression): boolean {
  const method = methodOf(call) ?? '';
  return ROW_METHODS.has(method) && !(method === 'find' && isFunctionNode(call.arguments[0]));
}

type Scope = { readonly keys: string; readonly context: Context };

function descendants(root: TSESTree.Node): TSESTree.Node[] {
  const all: TSESTree.Node[] = [root];
  for (const node of all) {
    appendAll(all, nodeChildren(node));
  }
  return all;
}

function usesName(node: TSESTree.Node, names: ReadonlySet<string>): boolean {
  return descendants(node).some(
    (item) => item.type === AST_NODE_TYPES.Identifier && names.has(item.name),
  );
}

function originsOf(node: TSESTree.Node, context: Context): TSESTree.Node[] {
  const origins: TSESTree.Node[] = [];
  for (const item of descendants(node)) {
    const origin =
      item.type === AST_NODE_TYPES.Identifier ? resolveConstant(context, item) : undefined;
    if (origin !== undefined && origin !== item) {
      origins.push(origin);
    }
  }
  return origins;
}

function derivesFromKeys(node: TSESTree.Node, scope: Scope): boolean {
  const names = new Set([scope.keys]);
  const layers = [[node]];
  for (const layer of layers) {
    if (layer.some((item) => usesName(item, names))) {
      return true;
    }
    const next = layer.flatMap((item) => originsOf(item, scope.context));
    if (layers.length <= MAX_DERIVATION && next.length > 0) {
      layers.push(next);
    }
  }
  return false;
}

function isGuardedByKeys(node: TSESTree.Node, scope: Scope): boolean {
  return ancestorsOf(node).some(
    (ancestor) =>
      ancestor.type === AST_NODE_TYPES.IfStatement && derivesFromKeys(ancestor.test, scope),
  );
}

function prefilledMap(receiver: TSESTree.Node, keys: string, context: Context): boolean {
  const origin =
    receiver.type === AST_NODE_TYPES.Identifier ? resolveConstant(context, receiver) : undefined;
  return (
    origin?.type === AST_NODE_TYPES.NewExpression &&
    nameOf(origin.callee) === 'Map' &&
    origin.arguments.some((argument) => usesName(argument, new Set([keys])))
  );
}

function isKeyLookup(node: TSESTree.Node, params: ReadonlySet<string>, scope: Scope): boolean {
  const receiver = node.type === AST_NODE_TYPES.CallExpression ? node.callee : undefined;
  const owner = receiver?.type === AST_NODE_TYPES.MemberExpression ? receiver.object : undefined;
  return (
    node.type === AST_NODE_TYPES.CallExpression &&
    LOOKUPS.has(methodOf(node) ?? '') &&
    node.arguments.some((argument) => usesName(argument, params)) &&
    !(owner !== undefined && prefilledMap(owner, scope.keys, scope.context))
  );
}

function paramNamesOf(callback: TSESTree.Node): Set<string> {
  return isFunctionNode(callback)
    ? new Set(callback.params.map((param) => nameOf(param)).filter((name) => name !== undefined))
    : new Set<string>();
}

function findAssertions(callback: TSESTree.Node, scope: Scope): TSESTree.Node[] {
  const params = paramNamesOf(callback);
  return descendants(callback).filter(
    (node) =>
      node.type === AST_NODE_TYPES.TSNonNullExpression &&
      isKeyLookup(node.expression, params, scope),
  );
}

function onlyThrows(callee: TSESTree.Node, context: Context): boolean {
  const fn = resolveFunction(context, callee);
  const body = isFunctionNode(fn) ? fn.body : undefined;
  return (
    body?.type === AST_NODE_TYPES.BlockStatement &&
    body.body.length === 1 &&
    body.body[0]?.type === AST_NODE_TYPES.ThrowStatement
  );
}

function linksOf(node: TSESTree.Node, context: Context): TSESTree.Node[] {
  const origin =
    node.type === AST_NODE_TYPES.Identifier ? resolveConstant(context, node) : undefined;
  const links = nodeChildren(node);
  return origin !== undefined && origin !== node ? [origin, ...links] : links;
}

function reachableNodes(root: TSESTree.Node, context: Context): Set<TSESTree.Node> {
  const seen = new Set<TSESTree.Node>();
  const pending = [root];
  for (const node of pending) {
    if (!seen.has(node)) {
      seen.add(node);
      appendAll(pending, linksOf(node, context));
    }
  }
  return seen;
}

function containsLookup(root: TSESTree.Node, params: ReadonlySet<string>, scope: Scope): boolean {
  return [...reachableNodes(root, scope.context)].some((node) => isKeyLookup(node, params, scope));
}

function missingCondition(node: TSESTree.Node): TSESTree.Node | undefined {
  const parent = node.parent;
  if (
    parent?.type === AST_NODE_TYPES.IfStatement ||
    parent?.type === AST_NODE_TYPES.ConditionalExpression
  ) {
    return parent.test;
  }
  return parent?.type === AST_NODE_TYPES.LogicalExpression ? parent.left : undefined;
}

function throwsOnMissing(node: TSESTree.Node, params: ReadonlySet<string>, scope: Scope): boolean {
  return [node, ...ancestorsOf(node)].some((ancestor) => {
    const condition = missingCondition(ancestor);
    return (
      condition !== undefined && condition !== ancestor && containsLookup(condition, params, scope)
    );
  });
}

function findThrows(callback: TSESTree.Node, scope: Scope): TSESTree.Node[] {
  const params = paramNamesOf(callback);
  return descendants(callback).filter((node) => {
    const throwsHere =
      node.type === AST_NODE_TYPES.ThrowStatement ||
      (node.type === AST_NODE_TYPES.CallExpression && onlyThrows(node.callee, scope.context));
    return throwsHere && throwsOnMissing(node, params, scope);
  });
}

function mapProblem(call: TSESTree.CallExpression, scope: Scope): Problem | undefined {
  const { keys } = scope;
  const { callee } = call;
  const overKeys =
    callee.type === AST_NODE_TYPES.MemberExpression &&
    nameOf(callee.property) === 'map' &&
    nameOf(callee.object) === keys;
  const [callback] = call.arguments;
  const [first] =
    overKeys && callback !== undefined
      ? [...findAssertions(callback, scope), ...findThrows(callback, scope)]
      : [];
  return first === undefined ? undefined : { kind: 'lookup', node: first };
}

function rowsProblem(call: TSESTree.CallExpression, context: Context): Problem | undefined {
  const { callee } = call;
  const receiver =
    callee.type === AST_NODE_TYPES.MemberExpression && methodOf(call) === 'map'
      ? unwrapValue(resolveConstant(context, callee.object) ?? callee.object)
      : undefined;
  const source = receiver ?? call;
  return source.type === AST_NODE_TYPES.CallExpression && isRowQuery(source)
    ? { kind: 'unmapped', node: call }
    : undefined;
}

function valueProblem(value: TSESTree.Node, scope: Scope): Problem | undefined {
  const chain = [unwrapValue(value)];
  for (const current of chain) {
    if (current.type !== AST_NODE_TYPES.Identifier) {
      break;
    }
    const origin = resolveConstant(scope.context, current);
    if (origin === undefined || chain.includes(unwrapValue(origin))) {
      return undefined;
    }
    chain.push(unwrapValue(origin));
  }
  const inner = chain[chain.length - 1] ?? value;
  const direct = chain.length === 1;
  if (inner.type === AST_NODE_TYPES.ArrayExpression) {
    return direct && inner.elements.length === 0 && !isGuardedByKeys(value, scope)
      ? { kind: 'empty', node: value }
      : undefined;
  }
  return inner.type === AST_NODE_TYPES.CallExpression
    ? (mapProblem(inner, scope) ?? rowsProblem(inner, scope.context))
    : undefined;
}

export function problemsOf(
  values: readonly TSESTree.Node[],
  keys: string,
  context: Context,
): Problem[] {
  return values
    .map((value) => valueProblem(value, { keys, context }))
    .filter((problem) => problem !== undefined);
}
