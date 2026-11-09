import { chainOf } from '../../../../../../shared/traversal.mjs';

const PRECEDENCE = new Map([
  ['as', 12],
  ['as?', 12],
  ['*', 11],
  ['/', 11],
  ['%', 11],
  ['+', 10],
  ['-', 10],
  ['..', 9],
  ['..<', 9],
  ['?:', 7],
  ['in', 6],
  ['!in', 6],
  ['is', 6],
  ['!is', 6],
  ['<', 5],
  ['>', 5],
  ['<=', 5],
  ['>=', 5],
  ['==', 4],
  ['!=', 4],
  ['===', 4],
  ['!==', 4],
  ['&&', 3],
  ['||', 2],
]);
const INFIX_PRECEDENCE = 8;
const TYPE_OPERATORS = new Set(['as', 'as?', 'is', '!is']);
const PREFIXES = new Set(['-', '+', '!', '++', '--', '::']);
const ATOMS = new Set(['word', 'number', 'string', 'char']);
const MEMBER_MARKS = new Set(['.', '?.', '::']);
const TYPE_MARKS = new Set(['.', '?', '*', ',', '<', '>', '->', '?.']);
const GENERIC_FOLLOWERS = new Set(['(', '{', '::']);
const LABELLED = new Set(['this', 'super']);
const RANGE_PREFIXES = new Set(['in', '!in', 'is', '!is']);

function textAt(state, position) {
  const item = state.items[position];
  return item === undefined ? undefined : state.tokens[item.token].text;
}

function isAttached(state, position) {
  const item = state.items[position];
  return item !== undefined && !state.tokens[item.token].newline;
}

function isGlued(state, position) {
  const before = state.items[position - 1];
  const item = state.items[position];
  if (before === undefined) {
    return false;
  }
  return state.tokens[item.token].start === state.tokens[before.close ?? before.token].end;
}

function genericStep(state, { index, depth }) {
  const item = state.items[index];
  if (item === undefined || !isTypeItem(state, item)) {
    return undefined;
  }
  return { index: index + 1, depth: depth + ({ '<': 1, '>': -1 }[textAt(state, index)] ?? 0) };
}

function genericEnd(state, position) {
  const open = state.items[position];
  if (open.close !== undefined || !isGlued(state, position)) {
    return undefined;
  }
  const end = chainOf({ index: position, depth: 0 }, (step) =>
    step.depth === 0 && step.index > position ? undefined : genericStep(state, step),
  ).at(-1);
  const closed = end.depth === 0 && end.index > position;
  return closed && GENERIC_FOLLOWERS.has(textAt(state, end.index)) ? end.index : undefined;
}

function postfixEnd(state, position) {
  const item = state.items[position];
  const text = textAt(state, position);
  if (item === undefined) {
    return undefined;
  }
  if (item.close !== undefined || text === '!!' || text === '++' || text === '--') {
    return isAttached(state, position) || text === '!!' ? position + 1 : undefined;
  }
  if (MEMBER_MARKS.has(text)) {
    const member = state.items[position + 1];
    return member !== undefined && state.tokens[member.token].kind === 'word'
      ? position + 2
      : undefined;
  }
  if (state.tokens[item.token].kind === 'at') {
    return LABELLED.has(textAt(state, position - 1)) ? position + 1 : undefined;
  }
  return text === '<' ? genericEnd(state, position) : undefined;
}

function isPrefix(state, position) {
  return PREFIXES.has(textAt(state, position)) && state.items[position].close === undefined;
}

function readOperand(state, start) {
  const atomAt = chainOf({ position: start }, ({ position }) =>
    isPrefix(state, position) ? { position: position + 1 } : undefined,
  ).at(-1).position;
  const atom = state.items[atomAt];
  if (
    atom === undefined ||
    (atom.close === undefined && !ATOMS.has(state.tokens[atom.token].kind))
  ) {
    return undefined;
  }
  const end = chainOf(atomAt + 1, (position) => postfixEnd(state, position)).at(-1);
  return { from: start, to: end };
}

function isTypeItem(state, item) {
  const { kind, text } = state.tokens[item.token];
  return item.close !== undefined || kind === 'word' || TYPE_MARKS.has(text);
}

function typeStep(state, position, depth) {
  const text = textAt(state, position);
  const opens = text === '<' && isGlued(state, position);
  if (depth === 0 && PRECEDENCE.has(text) && !opens) {
    return undefined;
  }
  if (opens) {
    return depth + 1;
  }
  return text === '>' ? depth - 1 : depth;
}

function typeAdvance(state, { position, depth }) {
  const item = state.items[position];
  if (item === undefined || !isTypeItem(state, item)) {
    return undefined;
  }
  const next = typeStep(state, position, depth);
  return next === undefined || next < 0 ? undefined : { position: position + 1, depth: next };
}

function readType(state, start) {
  const end = chainOf({ position: start, depth: 0 }, (step) => typeAdvance(state, step)).at(
    -1,
  ).position;
  return end === start ? undefined : { from: start, to: end, type: true };
}

function readOperator(state, position) {
  const item = state.items[position];
  const text = textAt(state, position);
  if (item.close !== undefined) {
    return undefined;
  }
  if (PRECEDENCE.has(text)) {
    return { text, precedence: PRECEDENCE.get(text), position, token: item.token };
  }
  const isInfix = state.tokens[item.token].kind === 'word';
  return isInfix ? { text, precedence: INFIX_PRECEDENCE, position, token: item.token } : undefined;
}

function nextOperand(state, sequence, operand) {
  sequence.operands.push(operand);
  if (operand.to === state.items.length) {
    return undefined;
  }
  const operator = readOperator(state, operand.to);
  if (operator === undefined) {
    return undefined;
  }
  sequence.operators.push(operator);
  const read = TYPE_OPERATORS.has(operator.text) ? readType : readOperand;
  return read(state, operator.position + 1);
}

function readSequence(state) {
  const sequence = { operands: [], operators: [] };
  const read = chainOf(readOperand(state, 0), (operand) => nextOperand(state, sequence, operand));
  return read.at(-1)?.to === state.items.length ? sequence : undefined;
}

function leaf(state, { from, to, type }) {
  const items = state.items.slice(from, to);
  const last = items.at(-1);
  return { items, type, first: items[0].token, last: last.close ?? last.token };
}

function reduce(output, operator) {
  const right = output.pop();
  const left = output.pop();
  const node = {
    operator: operator.text,
    left,
    right,
    first: left.first,
    last: right.last,
    infix: operator.precedence === INFIX_PRECEDENCE ? operator.token : undefined,
  };
  left.parent = node;
  right.parent = node;
  output.push(node);
}

function reduceFrom(output, pending, precedence) {
  for (const operator of pending.toReversed()) {
    if (operator.precedence < precedence) {
      return;
    }
    reduce(output, pending.pop());
  }
}

function treeOf(state, sequence) {
  const output = [leaf(state, sequence.operands[0])];
  const pending = [];
  for (const [index, operator] of sequence.operators.entries()) {
    reduceFrom(output, pending, operator.precedence);
    pending.push(operator);
    output.push(leaf(state, sequence.operands[index + 1]));
  }
  for (const operator of pending.toReversed()) {
    reduce(output, operator);
  }
  return output[0];
}

/** The expression tree of a range (`&&`, comparisons and arithmetic as nodes, operands as leaves), or undefined. */
export function rangeTree(tokens, items) {
  const skip =
    RANGE_PREFIXES.has(tokens[items[0].token].text) && items[0].close === undefined ? 1 : 0;
  const state = { tokens, items: items.slice(skip) };
  if (state.items.length === 0) {
    return undefined;
  }
  const sequence = readSequence(state);
  return sequence === undefined ? undefined : treeOf(state, sequence);
}
