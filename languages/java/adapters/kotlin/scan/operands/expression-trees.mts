import { chainFrom } from '../typed/typed-scan.mts';
import type { Item, Leaf, Node, Token, TokenState, Tree } from '../typed/operand-shapes.mts';

type Operator = { text: string; precedence: number; position: number; token: number };
type Operand = { from: number; to: number; type?: true };
type Sequence = { operands: Operand[]; operators: Operator[] };
type GenericStep = { index: number; depth: number };
type TypeStep = { position: number; depth: number };

const PRECEDENCE = new Map<string, number>([
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
const GENERIC_DEPTH: Readonly<Record<string, number>> = { '<': 1, '>': -1 };
const INFIX_PRECEDENCE = 8;
const TYPE_OPERATORS = new Set(['as', 'as?', 'is', '!is']);
const PREFIXES = new Set(['-', '+', '!', '++', '--', '::']);
const ATOMS = new Set(['word', 'number', 'string', 'char']);
const MEMBER_MARKS = new Set(['.', '?.', '::']);
const TYPE_MARKS = new Set(['.', '?', '*', ',', '<', '>', '->', '?.']);
const GENERIC_FOLLOWERS = new Set(['(', '{', '::']);
const LABELLED = new Set(['this', 'super']);
const RANGE_PREFIXES = new Set(['in', '!in', 'is', '!is']);

function tokenOf(state: TokenState, item: Item): Token | undefined {
  return state.tokens[item.token];
}

function textAt(state: TokenState, position: number): string {
  const item = state.items[position];
  return (item === undefined ? undefined : tokenOf(state, item)?.text) ?? '';
}

function isAttached(state: TokenState, position: number): boolean {
  const item = state.items[position];
  return item !== undefined && tokenOf(state, item)?.newline !== true;
}

function isGlued(state: TokenState, position: number): boolean {
  const before = state.items[position - 1];
  const item = state.items[position];
  if (before === undefined || item === undefined) {
    return false;
  }
  return state.tokens[item.token]?.start === state.tokens[before.close ?? before.token]?.end;
}

function genericStep(state: TokenState, { index, depth }: GenericStep): GenericStep | undefined {
  const item = state.items[index];
  if (item === undefined || !isTypeItem(state, item)) {
    return undefined;
  }
  return { index: index + 1, depth: depth + (GENERIC_DEPTH[textAt(state, index)] ?? 0) };
}

function genericEnd(state: TokenState, position: number): number | undefined {
  const open = state.items[position];
  if (open === undefined || open.close !== undefined || !isGlued(state, position)) {
    return undefined;
  }
  const end = chainFrom<GenericStep>({ index: position, depth: 0 }, (step: GenericStep) =>
    step.depth === 0 && step.index > position ? undefined : genericStep(state, step),
  ).at(-1);
  const closed = end !== undefined && end.depth === 0 && end.index > position;
  return closed && GENERIC_FOLLOWERS.has(textAt(state, end.index)) ? end.index : undefined;
}

function postfixEnd(state: TokenState, position: number): number | undefined {
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
    return member !== undefined && tokenOf(state, member)?.kind === 'word'
      ? position + 2
      : undefined;
  }
  if (tokenOf(state, item)?.kind === 'at') {
    return LABELLED.has(textAt(state, position - 1)) ? position + 1 : undefined;
  }
  return text === '<' ? genericEnd(state, position) : undefined;
}

function isPrefix(state: TokenState, position: number): boolean {
  return PREFIXES.has(textAt(state, position)) && state.items[position]?.close === undefined;
}

function readOperand(state: TokenState, start: number): Operand | undefined {
  const atomAt =
    chainFrom<{ position: number }>({ position: start }, ({ position }: { position: number }) =>
      isPrefix(state, position) ? { position: position + 1 } : undefined,
    ).at(-1)?.position ?? start;
  const atom = state.items[atomAt];
  if (
    atom === undefined ||
    (atom.close === undefined && !ATOMS.has(tokenOf(state, atom)?.kind ?? ''))
  ) {
    return undefined;
  }
  const end = chainFrom<number>(atomAt + 1, (position: number) => postfixEnd(state, position)).at(
    -1,
  );
  return { from: start, to: end ?? atomAt + 1 };
}

function isTypeItem(state: TokenState, item: Item): boolean {
  const { kind = '', text = '' } = state.tokens[item.token] ?? {};
  return item.close !== undefined || kind === 'word' || TYPE_MARKS.has(text);
}

function typeStep(state: TokenState, position: number, depth: number): number | undefined {
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

function typeAdvance(state: TokenState, { position, depth }: TypeStep): TypeStep | undefined {
  const item = state.items[position];
  if (item === undefined || !isTypeItem(state, item)) {
    return undefined;
  }
  const next = typeStep(state, position, depth);
  return next === undefined || next < 0 ? undefined : { position: position + 1, depth: next };
}

function readType(state: TokenState, start: number): Operand | undefined {
  const end =
    chainFrom<TypeStep>({ position: start, depth: 0 }, (step: TypeStep) =>
      typeAdvance(state, step),
    ).at(-1)?.position ?? start;
  return end === start ? undefined : { from: start, to: end, type: true };
}

function readOperator(state: TokenState, position: number): Operator | undefined {
  const item = state.items[position];
  const text = textAt(state, position);
  if (item === undefined || item.close !== undefined) {
    return undefined;
  }
  const precedence = PRECEDENCE.get(text);
  if (precedence !== undefined) {
    return { text, precedence, position, token: item.token };
  }
  const isInfix = tokenOf(state, item)?.kind === 'word';
  return isInfix ? { text, precedence: INFIX_PRECEDENCE, position, token: item.token } : undefined;
}

function nextOperand(state: TokenState, sequence: Sequence, operand: Operand): Operand | undefined {
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

function readSequence(state: TokenState): Sequence | undefined {
  const sequence: Sequence = { operands: [], operators: [] };
  const read = chainFrom<Operand>(readOperand(state, 0), (operand: Operand) =>
    nextOperand(state, sequence, operand),
  );
  return read.at(-1)?.to === state.items.length ? sequence : undefined;
}

function leaf(state: TokenState, { from, to, type }: Operand): Leaf {
  const items = state.items.slice(from, to);
  const last = items.at(-1);
  return {
    items,
    type,
    first: items[0]?.token ?? -1,
    last: last === undefined ? -1 : (last.close ?? last.token),
  };
}

function reduce(output: Tree[], operator: Operator): void {
  const right = output.pop();
  const left = output.pop();
  if (left === undefined || right === undefined) {
    return;
  }
  const node: Node = {
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

function reduceFrom(output: Tree[], pending: Operator[], precedence: number): void {
  for (const operator of pending.toReversed()) {
    if (operator.precedence < precedence) {
      return;
    }
    pending.pop();
    reduce(output, operator);
  }
}

function treeOf(state: TokenState, sequence: Sequence): Tree | undefined {
  const [firstOperand] = sequence.operands;
  if (firstOperand === undefined) {
    return undefined;
  }
  const output: Tree[] = [leaf(state, firstOperand)];
  const pending: Operator[] = [];
  for (const [index, operator] of sequence.operators.entries()) {
    reduceFrom(output, pending, operator.precedence);
    pending.push(operator);
    const operand = sequence.operands[index + 1];
    if (operand !== undefined) {
      output.push(leaf(state, operand));
    }
  }
  for (const operator of pending.toReversed()) {
    reduce(output, operator);
  }
  return output[0];
}

export function rangeTree(tokens: Token[], items: Item[]): Tree | undefined {
  const [head] = items;
  const skip =
    head !== undefined &&
    RANGE_PREFIXES.has(tokens[head.token]?.text ?? '') &&
    head.close === undefined
      ? 1
      : 0;
  const state: TokenState = { tokens, items: items.slice(skip) };
  if (state.items.length === 0) {
    return undefined;
  }
  const sequence = readSequence(state);
  return sequence === undefined ? undefined : treeOf(state, sequence);
}
