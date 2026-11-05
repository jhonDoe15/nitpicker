import { chainOf } from '../analysis/ancestry.mjs';
import { isFunctionNode, resolveConstant } from '../analysis/constant-resolution.mjs';
import { memberName, unwrapped } from '../security/security-values.mjs';
import { globalMemberCall, isPromiseConstruction, ownNodesIn } from './syntax-nodes.mjs';

const CHAIN_METHODS = new Set(['then', 'catch', 'finally']);
const COMBINATORS = ['all', 'allSettled', 'race', 'any'];
const SETTLED = ['resolve', 'reject'];
const MAX_DEPTH = 4;

function chainInner(call) {
  const callee = unwrapped(call.callee);
  return callee.type === 'MemberExpression' && CHAIN_METHODS.has(memberName(callee))
    ? unwrapped(callee.object)
    : undefined;
}

function linksOf(call) {
  const chain = [call];
  for (const current of chain) {
    const inner = chainInner(current);
    if (inner?.type === 'CallExpression') {
      chain.push(inner);
    }
  }
  return chain;
}

export function combinedEntries(context, call) {
  const list = unwrapped(resolveConstant(context, unwrapped(call.arguments[0])));
  return (list?.elements ?? []).filter((inner) => inner !== null && inner.type !== 'SpreadElement');
}

export function returnedValues(fn) {
  if (!isFunctionNode(fn)) {
    return [];
  }
  if (fn.body.type !== 'BlockStatement') {
    return [fn.body];
  }
  return ownNodesIn(fn.body)
    .filter((node) => node.type === 'ReturnStatement' && node.argument !== null)
    .map((node) => node.argument);
}

function executorStatements(fn) {
  if (!isFunctionNode(fn)) {
    return [];
  }
  if (fn.body.type !== 'BlockStatement') {
    return [fn.body];
  }
  return fn.body.body
    .filter((statement) => statement.type === 'ExpressionStatement')
    .map((statement) => statement.expression);
}

function chainedEntries(context, target) {
  const chain = linksOf(target);
  const root = chain.at(-1);
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

function innerEntries(context, target) {
  if (target.type === 'ConditionalExpression') {
    return [target.consequent, target.alternate];
  }
  if (isPromiseConstruction(context, target)) {
    return executorStatements(unwrapped(target.arguments[0]));
  }
  return target.type === 'CallExpression' ? chainedEntries(context, target) : undefined;
}

export function operationsIn(context, entry) {
  const pending = [{ node: entry, depth: 0 }];
  const found = [];
  for (const { node, depth } of pending) {
    const target = unwrapped(resolveConstant(context, unwrapped(node)));
    const inner = target === undefined || depth > MAX_DEPTH ? [] : innerEntries(context, target);
    if (inner !== undefined) {
      pending.push(...inner.map((child) => ({ node: child, depth: depth + 1 })));
    } else if (target.type === 'CallExpression') {
      found.push(linksOf(target).at(-1));
    }
  }
  return found;
}

function chainedCall(node) {
  const member = node.parent;
  const chained =
    member?.type === 'MemberExpression' &&
    member.object === node &&
    CHAIN_METHODS.has(memberName(member)) &&
    member.parent.type === 'CallExpression' &&
    member.parent.callee === member;
  return chained ? member.parent : undefined;
}

export function settlementChain(node) {
  return chainOf(node, chainedCall).slice(1);
}
