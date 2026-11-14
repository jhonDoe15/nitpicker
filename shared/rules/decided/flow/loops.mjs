import { afterEffects, effectsOf, fact } from '../facts.mjs';
import { binaryOf, sourceOf, textOf } from './exits.mjs';

const KOTLIN_RANGES = new Map([
  ['until', 'exclusive'],
  ['downTo', 'down'],
]);
const KOTLIN_BINARY = new Map([
  ['..', 'inclusive'],
  ['..<', 'exclusive'],
]);
const BOUND_LITERALS = new Set(['number']);

function isPlainBound(node) {
  return node.kind !== 'literal' || BOUND_LITERALS.has(node.literal);
}

function pythonBounds(arguments_, zero) {
  const [first, second, step] = arguments_;
  if (arguments_.length === 1) {
    return { low: zero, high: first, shape: 'exclusive' };
  }
  if (step === undefined) {
    return { low: first, high: second, shape: 'exclusive' };
  }
  const negative =
    step.kind === 'unary' && step.value === '-' && step.children[0].kind === 'literal';
  if (step.kind === 'literal' && step.literal === 'number') {
    return { low: first, high: second, shape: 'exclusive' };
  }
  return negative ? { low: second, high: first, shape: 'descending' } : undefined;
}

function pythonRange(iter) {
  const [callee, ...arguments_] = iter.children;
  const isRange = callee?.kind === 'name' && callee.binding === 'free' && callee.value === 'range';
  if (!isRange || arguments_.some(({ kind }) => kind === 'expression')) {
    return undefined;
  }
  const zero = { kind: 'literal', literal: 'number', value: '0', children: [], start: iter.start };
  return arguments_.length >= 1 && arguments_.length <= 3
    ? pythonBounds(arguments_, zero)
    : undefined;
}

function kotlinRange(iter) {
  if (iter.kind === 'binary' && KOTLIN_BINARY.has(iter.value)) {
    const [low, high] = iter.children;
    return { low, high, shape: KOTLIN_BINARY.get(iter.value) };
  }
  const callee = iter.children[0];
  const shape =
    iter.kind === 'call' && callee.kind === 'member' ? KOTLIN_RANGES.get(callee.value) : undefined;
  if (shape === undefined || iter.children.length !== 2) {
    return undefined;
  }
  const [receiver] = callee.children;
  const [, other] = iter.children;
  return shape === 'down'
    ? { low: other, high: receiver, shape: 'inclusive' }
    : { low: receiver, high: other, shape };
}

function rangeOf(node) {
  const [, target, iter] = node.children;
  if (node.kind !== 'foreach' || target?.kind !== 'name' || iter === undefined) {
    return undefined;
  }
  const range = iter.kind === 'call' ? (pythonRange(iter) ?? kotlinRange(iter)) : kotlinRange(iter);
  return range !== undefined && isPlainBound(range.low) && isPlainBound(range.high)
    ? { ...range, target, iter }
    : undefined;
}

export function isIntegerLoop(node) {
  return rangeOf(node) !== undefined;
}

function rangeCondition({ low, high, shape, target }) {
  const upper = binaryOf(shape === 'exclusive' ? '<' : '<=', target, high);
  if (shape === 'descending') {
    return binaryOf('&&', binaryOf('<', low, target), binaryOf('<=', target, high));
  }
  return binaryOf('&&', binaryOf('<=', low, target), upper);
}

function countedFacts(node, flow) {
  const range = rangeOf(node);
  if (range === undefined) {
    return [];
  }
  const condition = rangeCondition(range);
  const reason = `the loop on line ${String(node.start)} only runs for \`${sourceOf(range.target)}\` in \`${textOf(range.iter)}\``;
  const known = fact(condition, flow.scope, { holds: true, reason });
  const body = node.children.at(-1);
  return known === undefined ? [] : afterEffects([known], effectsOf([body], flow), flow.mutable);
}

function testOf(node) {
  if (node.kind === 'while') {
    return node.children[0];
  }
  return node.kind === 'for' && node.children[1].kind !== 'none' ? node.children[1] : undefined;
}

export function loopEntry(node, flow) {
  const test = testOf(node);
  if (test === undefined) {
    return { test, facts: countedFacts(node, flow) };
  }
  const reason = `the loop on line ${String(node.start)} only runs while \`${textOf(test)}\``;
  const known = fact(test, flow.scope, { holds: true, reason });
  const surviving = known === undefined ? [] : [known];
  return { test, facts: afterEffects(surviving, effectsOf([test], flow), flow.mutable) };
}
