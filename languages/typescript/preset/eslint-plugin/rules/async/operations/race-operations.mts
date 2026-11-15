import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { isFunctionNode, resolveConstant } from '../../analysis/constant-resolution.mts';
import { memberName, unwrapped, type Context } from '../../security/security-values.mts';
import { chainOf } from '../../typed/node-views.mts';
import { globalMemberCall, isPromiseConstruction, ownNodesIn } from './syntax-nodes.mts';

const CHAIN_METHODS = new Set<string>(['then', 'catch', 'finally']);
const COMBINATORS = ['all', 'allSettled', 'race', 'any'];
const SETTLED = ['resolve', 'reject'];
const MAX_DEPTH = 4;

function chainInner(call: TSESTree.CallExpression): TSESTree.Node | undefined {
  const callee = unwrapped(call.callee);
  return callee.type === AST_NODE_TYPES.MemberExpression &&
    CHAIN_METHODS.has(memberName(callee) ?? '')
    ? unwrapped(callee.object)
    : undefined;
}

function linksOf(call: TSESTree.CallExpression): TSESTree.CallExpression[] {
  const chain = [call];
  for (const current of chain) {
    const inner = chainInner(current);
    if (inner?.type === AST_NODE_TYPES.CallExpression) {
      chain.push(inner);
    }
  }
  return chain;
}

export function combinedEntries(context: Context, call: TSESTree.CallExpression): TSESTree.Node[] {
  const list = unwrapped(resolveConstant(context, unwrapped(call.arguments[0])));
  return (list?.type === AST_NODE_TYPES.ArrayExpression ? list.elements : []).filter(
    (inner) => inner !== null && inner.type !== AST_NODE_TYPES.SpreadElement,
  );
}

export function returnedValues(fn: TSESTree.Node): TSESTree.Node[] {
  if (!isFunctionNode(fn)) {
    return [];
  }
  if (fn.body.type !== AST_NODE_TYPES.BlockStatement) {
    return [fn.body];
  }
  return ownNodesIn(fn.body).flatMap((node) =>
    node.type === AST_NODE_TYPES.ReturnStatement && node.argument !== null ? [node.argument] : [],
  );
}

function executorStatements(fn: TSESTree.Node | undefined): TSESTree.Node[] {
  if (!isFunctionNode(fn)) {
    return [];
  }
  if (fn.body.type !== AST_NODE_TYPES.BlockStatement) {
    return [fn.body];
  }
  return fn.body.body.flatMap((statement) =>
    statement.type === AST_NODE_TYPES.ExpressionStatement ? [statement.expression] : [],
  );
}

function chainedEntries(
  context: Context,
  target: TSESTree.CallExpression,
): TSESTree.Node[] | undefined {
  const chain = linksOf(target);
  const root = chain.at(-1) ?? target;
  if (COMBINATORS.some((name) => globalMemberCall(context, root, `Promise.${name}`))) {
    return combinedEntries(context, root);
  }
  if (SETTLED.some((name) => globalMemberCall(context, root, `Promise.${name}`))) {
    return chain
      .slice(0, -1)
      .flatMap((link) => link.arguments.flatMap((argument) => returnedValues(unwrapped(argument))));
  }
  return undefined;
}

function innerEntries(context: Context, target: TSESTree.Node): TSESTree.Node[] | undefined {
  if (target.type === AST_NODE_TYPES.ConditionalExpression) {
    return [target.consequent, target.alternate];
  }
  if (target.type === AST_NODE_TYPES.NewExpression && isPromiseConstruction(context, target)) {
    return executorStatements(unwrapped(target.arguments[0]));
  }
  return target.type === AST_NODE_TYPES.CallExpression
    ? chainedEntries(context, target)
    : undefined;
}

export function operationsIn(context: Context, entry: TSESTree.Node): TSESTree.CallExpression[] {
  const pending = [{ node: entry, depth: 0 }];
  const found: TSESTree.CallExpression[] = [];
  for (const { node, depth } of pending) {
    const target = unwrapped(resolveConstant(context, unwrapped(node)));
    const inner = target === undefined || depth > MAX_DEPTH ? [] : innerEntries(context, target);
    if (inner !== undefined) {
      pending.push(...inner.map((child) => ({ node: child, depth: depth + 1 })));
    } else if (target?.type === AST_NODE_TYPES.CallExpression) {
      found.push(linksOf(target).at(-1) ?? target);
    }
  }
  return found;
}

function chainedCall(node: TSESTree.CallExpression): TSESTree.CallExpression | undefined {
  const member = node.parent;
  if (
    member.type === AST_NODE_TYPES.MemberExpression &&
    member.object === node &&
    CHAIN_METHODS.has(memberName(member) ?? '') &&
    member.parent.type === AST_NODE_TYPES.CallExpression &&
    member.parent.callee === member
  ) {
    return member.parent;
  }
  return undefined;
}

export function settlementChain(node: TSESTree.CallExpression): TSESTree.CallExpression[] {
  return chainOf(node, chainedCall).slice(1);
}
