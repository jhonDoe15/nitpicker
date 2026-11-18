import { chainOf } from '../../../traversal.mjs';
import { rangeOfTag } from '../../../logic/bitvectors/widths.mjs';
import { goIntegerWidth } from '../../../near-duplicates/proof/integer-types.mjs';
import { tagOf, typedByKind } from './typed-dispatch.mjs';

const ARITHMETIC = new Set(['+', '-', '*', '/', '%', '&', '|', '^']);
const COMPARISONS = new Set(['<', '<=', '>', '>=', '==', '!=']);
const UNARY = new Set(['-', '+', '~']);
const SIZE = Object.freeze({ bits: 64, signed: true });
const RADIX = [
  [/^0x(?<digits>[\da-f_]+)$/iu, '0x'],
  [/^0b(?<digits>[01_]+)$/iu, '0b'],
  [/^0o(?<digits>[0-7_]+)$/iu, '0o'],
  [/^0(?<digits>[0-7_]+)$/u, '0o'],
  [/^(?<digits>\d[\d_]*)$/u, ''],
];

function tagged(node, tag, fields = {}) {
  return tag === undefined ? node : { ...node, ...fields, bits: tag.bits, signed: tag.signed };
}

function fits(value, { bits, signed }) {
  const { min, max } = rangeOfTag({ bits, signed });
  return value >= min && value <= max;
}

function numberValue(text) {
  const [pattern, prefix] = RADIX.find(([form]) => form.test(text)) ?? [];
  return pattern === undefined
    ? undefined
    : BigInt(`${prefix}${pattern.exec(text).groups.digits.replaceAll('_', '')}`);
}

function isSign(node) {
  return node.kind === 'unary' && (node.value === '-' || node.value === '+');
}

function constantOf(node) {
  const signs = chainOf(node, (current) => (isSign(current) ? current.children[0] : undefined));
  const current = signs.at(-1);
  const negative = signs.slice(0, -1).filter((sign) => sign.value === '-').length % 2 === 1;
  const isNumber = current.kind === 'literal' && current.literal === 'number';
  const value = isNumber && current.bits === undefined ? numberValue(current.value) : undefined;
  return value !== undefined && negative ? -value : value;
}

function typedConstant(node, tag) {
  const value = constantOf(node);
  if (value === undefined || !fits(value, tag)) {
    return undefined;
  }
  const literal = { ...node, kind: 'literal', literal: 'number', value: String(value) };
  return tagged({ ...literal, children: [] }, tag);
}

function unifiedOperands(node) {
  const tags = node.children.map((child) => tagOf(child)).filter(Boolean);
  const [tag] = tags;
  if (
    tag === undefined ||
    tags.some((other) => other.bits !== tag.bits || other.signed !== tag.signed)
  ) {
    return undefined;
  }
  const operands = node.children.map((child) => (tagOf(child) ? child : typedConstant(child, tag)));
  return operands.every(Boolean) ? { tag, operands } : undefined;
}

function typedBinary(node) {
  const isArithmetic = ARITHMETIC.has(node.value);
  const unified = isArithmetic || COMPARISONS.has(node.value) ? unifiedOperands(node) : undefined;
  if (unified === undefined) {
    return node;
  }
  const rebuilt = { ...node, children: unified.operands };
  return isArithmetic ? tagged(rebuilt, unified.tag) : rebuilt;
}

function typedUnary(node) {
  return UNARY.has(node.value) ? tagged(node, tagOf(node.children[0])) : node;
}

function typedCast(node) {
  const [type, value] = node.children;
  const target =
    node.value === 'cast' && type.kind === 'type' ? goIntegerWidth(type.value) : undefined;
  if (target === undefined) {
    return node;
  }
  if (tagOf(value) !== undefined) {
    return tagged({ ...node, children: [value] }, target, { operation: 'cast' });
  }
  return typedConstant(value, target) ?? node;
}

/**
 * `tree` with the fixed-width type of each Go integer expression it can know: names by their
 * declared type, `len` and `cap`, conversions and the arithmetic of such operands. Go does not
 * promote, so an operation keeps the width of its operands, and an untyped constant next to a typed
 * operand takes that operand's type. Anything with an operand of unknown type has no width.
 */
export function goTypedTree(tree, { types }) {
  const labels = new Map(
    [...types].flatMap(([name, text]) =>
      goIntegerWidth(text) === undefined ? [] : [[name, goIntegerWidth(text)]],
    ),
  );
  return typedByKind(tree, {
    name: (node) => (node.binding === 'bound' ? tagged(node, labels.get(node.value)) : node),
    binary: typedBinary,
    unary: typedUnary,
    expression: typedCast,
    call: (node) => (node.model === 'size' ? tagged(node, SIZE) : node),
  });
}
