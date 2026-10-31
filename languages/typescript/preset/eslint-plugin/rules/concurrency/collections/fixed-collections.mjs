import { findVariable, resolveConstant } from '../../analysis/constant-resolution.mjs';
import { memberName } from '../../security/security-values.mjs';
import { descendants, skipped } from '../io-origin.mjs';

const CHUNKERS = new Set([
  'chunk',
  'chunked',
  'chunks',
  'splitEvery',
  'cluster',
  'batch',
  'batches',
  'inGroupsOf',
]);
const KEEPS_SIZE = new Set([
  'filter',
  'map',
  'sort',
  'toSorted',
  'reverse',
  'toReversed',
  'flat',
  'fill',
  'keys',
]);
const OBJECT_VIEWS = new Set(['keys', 'values', 'entries']);
const SIZES = new Set(['length', 'size']);
const MAX_DEPTH = 6;

function numericParts(target) {
  if (target.type === 'Literal') {
    return typeof target.value === 'number' ? [] : undefined;
  }
  if (target.type === 'UnaryExpression') {
    return [target.argument];
  }
  return target.type === 'BinaryExpression' ? [target.left, target.right] : undefined;
}

function numeric(context, node) {
  const pending = [{ node, depth: 0 }];
  for (const entry of pending) {
    const target = resolveConstant(context, skipped(entry.node));
    const parts =
      target === undefined || entry.depth > MAX_DEPTH ? undefined : numericParts(target);
    if (parts === undefined) {
      return false;
    }
    pending.push(...parts.map((part) => ({ node: part, depth: entry.depth + 1 })));
  }
  return true;
}

function explicitSize(node) {
  return ![...descendants(node)].some(
    (child) => child.type === 'MemberExpression' && SIZES.has(memberName(child)),
  );
}

function resolvedValue(context, node) {
  const seen = [skipped(node)];
  for (const current of seen) {
    const next = skipped(resolveConstant(context, current));
    if (next === current || next === undefined || seen.length >= MAX_DEPTH) {
      return next;
    }
    seen.push(next);
  }
  return undefined;
}

function isEnum(context, identifier) {
  const definition = findVariable(context, identifier, identifier.name)?.defs[0];
  return definition?.type === 'TSEnumName';
}

function sizedWindow(context, call) {
  const [first, second] = call.arguments;
  if (memberName(call.callee) === 'slice' && second === undefined) {
    return first !== undefined && numeric(context, first);
  }
  return second !== undefined && explicitSize(second);
}

function sizedByLength(context, node) {
  const object = skipped(node);
  const length =
    object?.type === 'ObjectExpression'
      ? object.properties.find((p) => p.key?.name === 'length')
      : undefined;
  return length !== undefined && explicitSize(resolvedValue(context, length.value));
}

function countOf(context, node) {
  return node !== undefined && explicitSize(resolvedValue(context, node));
}

function isChunkCall(context, node) {
  const target = resolveConstant(context, skipped(node));
  const name = target?.callee?.name ?? (target?.callee ? memberName(target.callee) : undefined);
  const chunker = target?.type === 'CallExpression' && CHUNKERS.has(name);
  return chunker && target.arguments[1] !== undefined && explicitSize(target.arguments[1]);
}

function isChunkVariable(context, identifier) {
  const definition = findVariable(context, identifier, identifier.name)?.defs[0];
  const loop = definition?.type === 'Variable' ? definition.node.parent?.parent : undefined;
  return loop?.type === 'ForOfStatement' && isChunkCall(context, loop.right);
}

function fixedCall(context, call) {
  const name = call.callee.type === 'MemberExpression' ? memberName(call.callee) : call.callee.name;
  const owner = call.callee.type === 'MemberExpression' ? skipped(call.callee.object) : undefined;
  if (['slice', 'splice'].includes(name)) {
    return sizedWindow(context, call);
  }
  if (owner?.name === 'Object' && OBJECT_VIEWS.has(name)) {
    return { next: [call.arguments[0]] };
  }
  if (owner?.name === 'Array' && name === 'from') {
    return sizedByLength(context, call.arguments[0]);
  }
  if (name === 'Array' && call.arguments.length === 1) {
    return countOf(context, call.arguments[0]);
  }
  return KEEPS_SIZE.has(name) && owner !== undefined ? { next: [owner] } : false;
}

function arrayStep(target) {
  if (target.elements.length === 0 || target.elements.some((element) => !element)) {
    return false;
  }
  const spreads = target.elements
    .filter((element) => element.type === 'SpreadElement')
    .map((element) => element.argument);
  return spreads.length === 0 || { next: spreads };
}

function fixedStep(context, target) {
  if (target.type === 'ArrayExpression') {
    return arrayStep(target);
  }
  if (target.type === 'ObjectExpression') {
    return (
      target.properties.length > 0 &&
      target.properties.every((property) => property.type === 'Property')
    );
  }
  if (target.type === 'CallExpression') {
    return fixedCall(context, target);
  }
  if (target.type === 'NewExpression') {
    return (
      target.callee.name === 'Array' &&
      target.arguments.length === 1 &&
      countOf(context, target.arguments[0])
    );
  }
  return (
    target.type === 'Identifier' && (isEnum(context, target) || isChunkVariable(context, target))
  );
}

export function isFixedCollection(context, node, start = 0) {
  const pending = [{ node, depth: start }];
  for (const entry of pending) {
    const target = resolvedValue(context, entry.node);
    const step =
      target === undefined || entry.depth > MAX_DEPTH ? false : fixedStep(context, target);
    if (step === false) {
      return false;
    }
    if (step !== true) {
      pending.push(...step.next.map((next) => ({ node: next, depth: entry.depth + 1 })));
    }
  }
  return true;
}
