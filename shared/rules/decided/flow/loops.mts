import { afterEffects, effectsOf, fact } from '../facts.mts';
import { isOneOf, placed, present } from '../../../near-duplicates/tree/nodes.mts';
import { binaryOf, sourceOf, nodeText } from './exits.mts';
import type { Fact, Flow, FlowNode } from '../typed/decided-types.mts';

type Range = { readonly low: FlowNode; readonly high: FlowNode; readonly shape: string };
type LoopRange = Range & { readonly target: FlowNode; readonly iter: FlowNode };

const EXCLUSIVE = 'exclusive';
const NUMBER = 'number';

const KOTLIN_RANGES = new Map([
  ['until', EXCLUSIVE],
  ['downTo', 'down'],
]);
const KOTLIN_BINARY = new Map([
  ['..', 'inclusive'],
  ['..<', EXCLUSIVE],
]);
const BOUND_LITERALS = new Set([NUMBER]);
const MAX_RANGE_OPERANDS = 3;

function isPlainBound(node: FlowNode): boolean {
  return node.kind !== 'literal' || isOneOf(BOUND_LITERALS, node.literal);
}

function pythonBounds(operands: readonly FlowNode[], zero: FlowNode): Range | undefined {
  const [first, second, step] = operands;
  if (operands.length === 1) {
    return { low: zero, high: present(first), shape: EXCLUSIVE };
  }
  if (step === undefined) {
    return { low: present(first), high: present(second), shape: EXCLUSIVE };
  }
  const negative =
    step.kind === 'unary' && step.value === '-' && present(step.children[0]).kind === 'literal';
  if (step.kind === 'literal' && step.literal === NUMBER) {
    return { low: present(first), high: present(second), shape: EXCLUSIVE };
  }
  return negative ? { low: present(second), high: present(first), shape: 'descending' } : undefined;
}

function pythonRange(iter: FlowNode): Range | undefined {
  const [callee, ...operands] = iter.children;
  const isRange = callee?.kind === 'name' && callee.binding === 'free' && callee.value === 'range';
  if (!isRange || operands.some(({ kind }) => kind === 'expression')) {
    return undefined;
  }
  const zero: FlowNode = {
    kind: 'literal',
    literal: NUMBER,
    value: '0',
    children: [],
    ...placed(iter.start, undefined),
  };
  return operands.length >= 1 && operands.length <= MAX_RANGE_OPERANDS
    ? pythonBounds(operands, zero)
    : undefined;
}

function kotlinRange(iter: FlowNode): Range | undefined {
  const binaryShape = iter.value === undefined ? undefined : KOTLIN_BINARY.get(iter.value);
  if (iter.kind === 'binary' && binaryShape !== undefined) {
    const [low, high] = iter.children;
    return { low: present(low), high: present(high), shape: binaryShape };
  }
  const callee = iter.children[0];
  const shape =
    iter.kind === 'call' && callee?.kind === 'member'
      ? KOTLIN_RANGES.get(callee.value ?? '')
      : undefined;
  if (shape === undefined || callee === undefined || iter.children.length !== 2) {
    return undefined;
  }
  const receiver = present(callee.children[0]);
  const other = present(iter.children[1]);
  return shape === 'down'
    ? { low: other, high: receiver, shape: 'inclusive' }
    : { low: receiver, high: other, shape };
}

function rangeOf(node: FlowNode): LoopRange | undefined {
  const [, target, iter] = node.children;
  if (node.kind !== 'foreach' || target?.kind !== 'name' || iter === undefined) {
    return undefined;
  }
  const range = iter.kind === 'call' ? (pythonRange(iter) ?? kotlinRange(iter)) : kotlinRange(iter);
  return range !== undefined && isPlainBound(range.low) && isPlainBound(range.high)
    ? { ...range, target, iter }
    : undefined;
}

export function isIntegerLoop(node: FlowNode): boolean {
  return rangeOf(node) !== undefined;
}

function rangeCondition({ low, high, shape, target }: LoopRange): FlowNode {
  const upper = binaryOf(shape === EXCLUSIVE ? '<' : '<=', target, high);
  if (shape === 'descending') {
    return binaryOf('&&', binaryOf('<', low, target), binaryOf('<=', target, high));
  }
  return binaryOf('&&', binaryOf('<=', low, target), upper);
}

function countedFacts(node: FlowNode, flow: Flow): Fact[] {
  const range = rangeOf(node);
  if (range === undefined) {
    return [];
  }
  const condition = rangeCondition(range);
  const reason = `the loop on line ${String(node.start)} only runs for \`${sourceOf(range.target)}\` in \`${nodeText(range.iter)}\``;
  const known = fact(condition, flow.scope, { holds: true, reason });
  const body = node.children.at(-1);
  return known === undefined ? [] : afterEffects([known], effectsOf([body], flow), flow.mutable);
}

function testOf(node: FlowNode): FlowNode | undefined {
  if (node.kind === 'while') {
    return node.children[0];
  }
  return node.kind === 'for' && present(node.children[1]).kind !== 'none'
    ? node.children[1]
    : undefined;
}

export function loopEntry(
  node: FlowNode,
  flow: Flow,
): { test: FlowNode | undefined; facts: Fact[] } {
  const test = testOf(node);
  if (test === undefined) {
    return { test, facts: countedFacts(node, flow) };
  }
  const reason = `the loop on line ${String(node.start)} only runs while \`${nodeText(test)}\``;
  const known = fact(test, flow.scope, { holds: true, reason });
  const surviving = known === undefined ? [] : [known];
  return { test, facts: afterEffects(surviving, effectsOf([test], flow), flow.mutable) };
}
