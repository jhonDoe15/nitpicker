import { ancestorsOf, chainOf } from '../analysis/ancestry.mjs';
import {
  findVariable,
  isFunctionNode,
  resolveConstant,
  resolveFunction,
} from '../analysis/constant-resolution.mjs';
import { memberName } from '../security/security-values.mjs';
import { descendants, skipped } from './io-origin.mjs';

const COMBINATORS = new Set(['all', 'allSettled', 'any', 'race']);
const MAPPERS = new Set(['map', 'flatMap']);
const LOOPS = new Set(['ForOfStatement', 'ForInStatement']);
const MAX_DEPTH = 4;

export function combinatorName(call) {
  const callee = skipped(call.callee);
  const isPromise =
    callee.type === 'MemberExpression' &&
    callee.object.type === 'Identifier' &&
    callee.object.name === 'Promise' &&
    COMBINATORS.has(memberName(callee));
  return isPromise ? `Promise.${memberName(callee)}` : undefined;
}

export function workerOf(context, callback) {
  const target = skipped(callback);
  if (isFunctionNode(target)) {
    return { root: target, fn: target };
  }
  const resolved = resolveFunction(context, target);
  if (resolved !== undefined) {
    return { root: resolved, fn: resolved };
  }
  const reference = ['Identifier', 'MemberExpression'].includes(target?.type);
  return reference
    ? { root: target, calls: [{ type: 'CallExpression', callee: target, arguments: [] }] }
    : undefined;
}

function mapped(context, call) {
  const callee = skipped(call.callee);
  if (callee.type !== 'MemberExpression') {
    return [];
  }
  const worker = workerOf(context, call.arguments[0]);
  const owner = skipped(callee.object);
  if (MAPPERS.has(memberName(callee)) && worker !== undefined) {
    return [{ collection: callee.object, worker }];
  }
  const isFrom =
    owner.type === 'Identifier' && owner.name === 'Array' && memberName(callee) === 'from';
  const fromWorker = isFrom ? workerOf(context, call.arguments[1]) : undefined;
  return fromWorker === undefined ? [] : [{ collection: call.arguments[0], worker: fromWorker }];
}

function loopOf(current) {
  if (LOOPS.has(current.type) || current.type === 'ForStatement') {
    return { collection: current.right ?? current.test, body: current.body };
  }
  const each = current.type === 'CallExpression' && memberName(current.callee) === 'forEach';
  return each ? { collection: current.callee.object, body: current.arguments[0] } : undefined;
}

function enclosingLoop(node) {
  for (const current of ancestorsOf(node)) {
    const loop = loopOf(current);
    if (loop !== undefined) {
      return loop;
    }
    if (/Function/u.test(current.type) && current.parent?.type !== 'CallExpression') {
      return undefined;
    }
  }
  return undefined;
}

function pushed(context, identifier) {
  const variable = findVariable(context, identifier, identifier.name);
  const sites = [];
  for (const reference of variable?.references ?? []) {
    const member = reference.identifier.parent;
    const call = member.parent;
    const isPush = member.type === 'MemberExpression' && memberName(member) === 'push';
    const loop = isPush && call.type === 'CallExpression' ? enclosingLoop(call) : undefined;
    const awaited = call.arguments?.[0]?.type === 'AwaitExpression';
    if (
      loop !== undefined &&
      loop.collection !== undefined &&
      !awaited &&
      call.arguments[0] !== undefined
    ) {
      const expression = skipped(call.arguments[0]);
      sites.push({ collection: loop.collection, worker: { root: call, expression } });
    }
  }
  return sites;
}

export function mappings(context, node, depth = 0) {
  const target = skipped(node);
  if (target === undefined || depth > MAX_DEPTH) {
    return [];
  }
  if (target.type === 'ArrayExpression') {
    const spreads = target.elements.filter((element) => element?.type === 'SpreadElement');
    return spreads.flatMap((spread) => mappings(context, spread.argument, depth + 1));
  }
  if (target.type === 'CallExpression') {
    return mapped(context, target);
  }
  if (target.type !== 'Identifier') {
    return [];
  }
  const resolved = resolveConstant(context, target);
  const empty = resolved.type === 'ArrayExpression' && resolved.elements.length === 0;
  return resolved === target || empty
    ? pushed(context, target)
    : mappings(context, resolved, depth + 1);
}

function runsInside(node, root) {
  const path = chainOf(node, (current) => current.parent);
  const inside = path.slice(1, path.includes(root) ? path.indexOf(root) : undefined);
  return inside.every(
    (current) => !isFunctionNode(current) || current.parent?.type === 'CallExpression',
  );
}

export function callsOf(worker) {
  if (worker.calls !== undefined) {
    return worker.calls;
  }
  const body = worker.fn === undefined ? worker.expression : worker.fn.body;
  return [...descendants(body)].filter(
    (node) => node.type === 'CallExpression' && runsInside(node, body),
  );
}
