import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import {
  findVariable,
  isFunctionNode,
  resolveConstant,
  resolveFunction,
} from '../analysis/constant-resolution.mts';
import { memberName, staticKey, type Context } from '../security/security-values.mts';
import { ancestorsOf, chainOf } from '../typed/node-views.mts';
import { descendants, skipped } from './io-origin.mts';
import type { Invocation } from './origins/origin-types.mts';
import { appendAll } from '../../../../../../shared/lists/lists.mts';

type FunctionNode =
  TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression | TSESTree.FunctionDeclaration;
export type Worker = {
  readonly root: TSESTree.Node;
  readonly fn?: FunctionNode;
  readonly calls?: readonly Invocation[];
  readonly expression?: TSESTree.Node;
};
export type Site = { readonly collection: TSESTree.Node; readonly worker: Worker };
type Loop = {
  readonly collection: TSESTree.Node | undefined;
  readonly body: TSESTree.Node | undefined;
};
type Step = { readonly sites: Site[]; readonly next: TSESTree.Node[] };

const COMBINATORS = new Set(['all', 'allSettled', 'any', 'race']);
const MAPPERS = new Set(['map', 'flatMap']);
const SIZES = new Set(['length', 'size']);
const MAX_DEPTH = 4;

function isGlobalPromise(context: Context, node: TSESTree.Node): boolean {
  const target = skipped(resolveConstant(context, skipped(node)));
  return (
    target?.type === AST_NODE_TYPES.Identifier &&
    target.name === 'Promise' &&
    (findVariable(context, target, 'Promise')?.defs.length ?? 0) === 0
  );
}

export function combinatorName(
  context: Context,
  call: TSESTree.CallExpression,
): string | undefined {
  const callee = skipped(call.callee);
  if (callee.type !== AST_NODE_TYPES.MemberExpression) {
    return undefined;
  }
  const name = memberName(callee);
  return name !== undefined && COMBINATORS.has(name) && isGlobalPromise(context, callee.object)
    ? `Promise.${name}`
    : undefined;
}

function readsSize(node: TSESTree.Node): node is TSESTree.MemberExpression {
  return node.type === AST_NODE_TYPES.MemberExpression && SIZES.has(memberName(node) ?? '');
}

function sizeOwner(context: Context, node: TSESTree.Node): TSESTree.Node | undefined {
  const target = skipped(resolveConstant(context, skipped(node)));
  const member = target === undefined ? undefined : [...descendants(target)].find(readsSize);
  return member === undefined ? undefined : skipped(member.object);
}

function isLengthProperty(property: TSESTree.Node): property is TSESTree.Property {
  return property.type === AST_NODE_TYPES.Property && staticKey(property) === 'length';
}

function lengthOf(object: TSESTree.Node | undefined): TSESTree.Node | undefined {
  const target = skipped(object);
  return target?.type === AST_NODE_TYPES.ObjectExpression
    ? target.properties.find(isLengthProperty)?.value
    : undefined;
}

export function workerOf(
  context: Context,
  callback: TSESTree.Node | undefined,
): Worker | undefined {
  const target = skipped(callback);
  if (isFunctionNode(target)) {
    return { root: target, fn: target };
  }
  const resolved = resolveFunction(context, target);
  if (isFunctionNode(resolved)) {
    return { root: resolved, fn: resolved };
  }
  return target?.type === AST_NODE_TYPES.Identifier ||
    target?.type === AST_NODE_TYPES.MemberExpression
    ? { root: target, calls: [{ callee: target }] }
    : undefined;
}

function mapped(context: Context, call: TSESTree.CallExpression): Site[] {
  const callee = skipped(call.callee);
  if (callee.type !== AST_NODE_TYPES.MemberExpression) {
    return [];
  }
  const worker = workerOf(context, call.arguments[0]);
  const owner = skipped(callee.object);
  if (MAPPERS.has(memberName(callee) ?? '') && worker !== undefined) {
    return [{ collection: callee.object, worker }];
  }
  const isFrom =
    owner.type === AST_NODE_TYPES.Identifier &&
    owner.name === 'Array' &&
    memberName(callee) === 'from';
  const fromWorker = isFrom ? workerOf(context, call.arguments[1]) : undefined;
  if (fromWorker === undefined) {
    return [];
  }
  const length = lengthOf(call.arguments[0]);
  const sized = length === undefined ? undefined : sizeOwner(context, length);
  const collection = sized ?? call.arguments[0];
  return collection === undefined ? [] : [{ collection, worker: fromWorker }];
}

function countedCollection(
  context: Context,
  test: TSESTree.Node | undefined,
): TSESTree.Node | undefined {
  return test?.type === AST_NODE_TYPES.BinaryExpression && ['<', '<='].includes(test.operator)
    ? sizeOwner(context, test.right)
    : undefined;
}

function isForInOf(node: TSESTree.Node): node is TSESTree.ForOfStatement | TSESTree.ForInStatement {
  return node.type === AST_NODE_TYPES.ForOfStatement || node.type === AST_NODE_TYPES.ForInStatement;
}

function loopOf(context: Context, current: TSESTree.Node): Loop | undefined {
  if (isForInOf(current)) {
    return { collection: current.right, body: current.body };
  }
  if (current.type === AST_NODE_TYPES.ForStatement) {
    return {
      collection: countedCollection(context, current.test ?? undefined),
      body: current.body,
    };
  }
  if (
    current.type === AST_NODE_TYPES.CallExpression &&
    current.callee.type === AST_NODE_TYPES.MemberExpression &&
    memberName(current.callee) === 'forEach'
  ) {
    return { collection: current.callee.object, body: current.arguments[0] };
  }
  return undefined;
}

function enclosingLoop(context: Context, node: TSESTree.Node): Loop | undefined {
  for (const current of ancestorsOf(node)) {
    const loop = loopOf(context, current);
    if (loop !== undefined) {
      return loop;
    }
    if (
      current.type.includes('Function') &&
      current.parent?.type !== AST_NODE_TYPES.CallExpression
    ) {
      return undefined;
    }
  }
  return undefined;
}

function pushSite(context: Context, identifier: TSESTree.Node): Site | undefined {
  const member = identifier.parent;
  if (member?.type !== AST_NODE_TYPES.MemberExpression || memberName(member) !== 'push') {
    return undefined;
  }
  const call = member.parent;
  if (call.type !== AST_NODE_TYPES.CallExpression) {
    return undefined;
  }
  const loop = enclosingLoop(context, call);
  const [first] = call.arguments;
  const awaited = first?.type === AST_NODE_TYPES.AwaitExpression;
  if (loop?.collection === undefined || awaited || first === undefined) {
    return undefined;
  }
  return { collection: loop.collection, worker: { root: call, expression: skipped(first) } };
}

function pushed(context: Context, identifier: TSESTree.Identifier): Site[] {
  const variable = findVariable(context, identifier, identifier.name);
  return (variable?.references ?? [])
    .map((reference) => pushSite(context, reference.identifier))
    .filter((site) => site !== undefined);
}

function mappingStep(context: Context, target: TSESTree.Node): Step {
  if (target.type === AST_NODE_TYPES.ArrayExpression) {
    const spreads = target.elements.filter(
      (element): element is TSESTree.SpreadElement =>
        element?.type === AST_NODE_TYPES.SpreadElement,
    );
    return { sites: [], next: spreads.map((spread) => spread.argument) };
  }
  if (target.type === AST_NODE_TYPES.CallExpression) {
    return { sites: mapped(context, target), next: [] };
  }
  if (target.type !== AST_NODE_TYPES.Identifier) {
    return { sites: [], next: [] };
  }
  const resolved = resolveConstant(context, target);
  if (resolved === undefined) {
    return { sites: [], next: [] };
  }
  const empty = resolved.type === AST_NODE_TYPES.ArrayExpression && resolved.elements.length === 0;
  return resolved === target || empty
    ? { sites: pushed(context, target), next: [] }
    : { sites: [], next: [resolved] };
}

export function mappings(context: Context, node: TSESTree.Node): Site[] {
  const pending = [{ node, depth: 0 }];
  const sites: Site[] = [];
  for (const entry of pending) {
    const target = skipped(entry.node);
    if (entry.depth <= MAX_DEPTH) {
      const step = mappingStep(context, target);
      appendAll(sites, step.sites);
      appendAll(
        pending,
        step.next.map((next) => ({ node: next, depth: entry.depth + 1 })),
      );
    }
  }
  return sites;
}

function runsInside(node: TSESTree.Node, root: TSESTree.Node): boolean {
  const path = chainOf<TSESTree.Node>(node, (current) => current.parent);
  const inside = path.slice(1, path.includes(root) ? path.indexOf(root) : undefined);
  return inside.every(
    (current) => !isFunctionNode(current) || current.parent.type === AST_NODE_TYPES.CallExpression,
  );
}

export function callsOf(worker: Worker): readonly Invocation[] {
  if (worker.calls !== undefined) {
    return worker.calls;
  }
  const body = worker.fn === undefined ? worker.expression : worker.fn.body;
  if (body === undefined) {
    return [];
  }
  return [...descendants(body)].filter(
    (node): node is TSESTree.CallExpression =>
      node.type === AST_NODE_TYPES.CallExpression && runsInside(node, body),
  );
}
