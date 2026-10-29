import { ancestorsOf, chainOf } from '../analysis/ancestry.mjs';
import {
  findVariable,
  isFunctionNode,
  resolveConstant,
  resolveFunction,
} from '../analysis/constant-resolution.mjs';
import { memberName, staticKey } from '../security/security-values.mjs';
import { descendants, skipped } from './io-origin.mjs';

const COMBINATORS = new Set(['all', 'allSettled', 'any', 'race']);
const MAPPERS = new Set(['map', 'flatMap']);
const LOOPS = new Set(['ForOfStatement', 'ForInStatement']);
const SIZES = new Set(['length', 'size']);
const MAX_DEPTH = 4;

function isGlobalPromise(context, node) {
  const target = skipped(resolveConstant(context, skipped(node)));
  return (
    target?.type === 'Identifier' &&
    target.name === 'Promise' &&
    (findVariable(context, target, 'Promise')?.defs.length ?? 0) === 0
  );
}

export function combinatorName(context, call) {
  const callee = skipped(call.callee);
  const isPromise =
    callee.type === 'MemberExpression' &&
    COMBINATORS.has(memberName(callee)) &&
    isGlobalPromise(context, callee.object);
  return isPromise ? `Promise.${memberName(callee)}` : undefined;
}

function sizeOwner(context, node) {
  const target = skipped(resolveConstant(context, skipped(node)));
  const member = [...descendants(target)].find(
    (child) => child.type === 'MemberExpression' && SIZES.has(memberName(child)),
  );
  return member === undefined ? undefined : skipped(member.object);
}

function lengthOf(object) {
  const target = skipped(object);
  return target?.type === 'ObjectExpression'
    ? target.properties.find((property) => staticKey(property) === 'length')?.value
    : undefined;
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
  if (fromWorker === undefined) {
    return [];
  }
  const length = lengthOf(call.arguments[0]);
  const sized = length === undefined ? undefined : sizeOwner(context, length);
  return [{ collection: sized ?? call.arguments[0], worker: fromWorker }];
}

function countedCollection(context, test) {
  const bounded = test?.type === 'BinaryExpression' && ['<', '<='].includes(test.operator);
  return bounded ? sizeOwner(context, test.right) : undefined;
}

function loopOf(context, current) {
  if (LOOPS.has(current.type)) {
    return { collection: current.right, body: current.body };
  }
  if (current.type === 'ForStatement') {
    return { collection: countedCollection(context, current.test), body: current.body };
  }
  const each = current.type === 'CallExpression' && memberName(current.callee) === 'forEach';
  return each ? { collection: current.callee.object, body: current.arguments[0] } : undefined;
}

function enclosingLoop(context, node) {
  for (const current of ancestorsOf(node)) {
    const loop = loopOf(context, current);
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
    const loop =
      isPush && call.type === 'CallExpression' ? enclosingLoop(context, call) : undefined;
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

function mappingStep(context, target) {
  if (target.type === 'ArrayExpression') {
    const spreads = target.elements.filter((element) => element?.type === 'SpreadElement');
    return { sites: [], next: spreads.map((spread) => spread.argument) };
  }
  if (target.type === 'CallExpression') {
    return { sites: mapped(context, target), next: [] };
  }
  if (target.type !== 'Identifier') {
    return { sites: [], next: [] };
  }
  const resolved = resolveConstant(context, target);
  const empty = resolved.type === 'ArrayExpression' && resolved.elements.length === 0;
  return resolved === target || empty
    ? { sites: pushed(context, target), next: [] }
    : { sites: [], next: [resolved] };
}

export function mappings(context, node) {
  const pending = [{ node, depth: 0 }];
  const sites = [];
  for (const entry of pending) {
    const target = skipped(entry.node);
    if (target !== undefined && entry.depth <= MAX_DEPTH) {
      const step = mappingStep(context, target);
      sites.push(...step.sites);
      pending.push(...step.next.map((next) => ({ node: next, depth: entry.depth + 1 })));
    }
  }
  return sites;
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
