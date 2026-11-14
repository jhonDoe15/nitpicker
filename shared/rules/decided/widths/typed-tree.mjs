import {
  labelOfTag,
  maximumOf,
  minimumOf,
  promotedLabel,
  rangeOfTag,
  widthLabel,
  widthTag,
} from '../../../logic/bitvectors/widths.mjs';
import { typedByKind } from './typed-dispatch.mjs';

const NUMBER = 'number';

const ARITHMETIC = new Set(['+', '-', '*', '/', '%', '&', '|', '^']);
const SHIFTS = new Set(['<<', '>>', '>>>']);
const UNARY = new Set(['-', '+', '~']);
const MATH = new Set(['Math', 'StrictMath']);
const CONVERSIONS = new Map([
  ['toInt', 'int'],
  ['toLong', 'long'],
  ['toShort', 'short'],
  ['toByte', 'byte'],
]);
const LIMITS = new Map([
  ['Integer', 'int'],
  ['Int', 'int'],
  ['Long', 'long'],
  ['Short', 'short'],
  ['Byte', 'byte'],
]);
const ESCAPES = new Map([
  ['\\n', 10],
  ['\\t', 9],
  ['\\r', 13],
  ['\\b', 8],
  ['\\f', 12],
  ['\\0', 0],
  ["\\'", 39],
  ['\\\\', 92],
  ['\\"', 34],
]);
const RADIX = [
  [/^0x(?<digits>[\da-f_]+)$/iu, '0x'],
  [/^0b(?<digits>[01_]+)$/iu, '0b'],
  [/^0(?<digits>[0-7_]+)$/u, '0o'],
  [/^(?<digits>\d[\d_]*)$/u, ''],
];
const LONG_SUFFIX = /[lL]$/u;
const UNICODE = /^'\\u(?<code>[\da-fA-F]{4})'$/u;
const PLAIN = /^'(?<char>[^\\'])'$/u;

function labelOfType(type, kotlin) {
  const text = type?.kind === 'type' ? type.value.replace(/\?$/u, '').trim() : '';
  const label = widthLabel(text);
  return kotlin && label === 'char' ? undefined : label;
}

function tagged(node, label, fields = {}) {
  return label === undefined ? node : { ...node, ...fields, ...widthTag(label) };
}

function numberLabel(text) {
  const isLong = LONG_SUFFIX.test(text);
  const bare = text.replace(LONG_SUFFIX, '');
  const [pattern, prefix] = RADIX.find(([form]) => form.test(bare)) ?? [];
  if (pattern === undefined) {
    return undefined;
  }
  const value = BigInt(`${prefix}${pattern.exec(bare).groups.digits.replaceAll('_', '')}`);
  const label = isLong ? 'long' : 'int';
  const isHex = prefix !== '';
  const unsigned = rangeOfTag({ bits: widthTag(label).bits, signed: false });
  const limit = isHex ? unsigned.max : maximumOf(label) + BigInt(1);
  return value <= limit ? { label, value: String(value) } : undefined;
}

function charCode(text) {
  const plain = PLAIN.exec(text)?.groups.char;
  if (plain !== undefined) {
    return plain.codePointAt(0);
  }
  const unicode = UNICODE.exec(text)?.groups.code;
  return unicode === undefined ? ESCAPES.get(text.slice(1, -1)) : Number.parseInt(unicode, 16);
}

function typedLiteral(node, kotlin) {
  if (node.literal === NUMBER) {
    const found = numberLabel(node.value);
    return found === undefined ? node : tagged(node, found.label, { value: found.value });
  }
  const code = node.literal === 'char' && !kotlin ? charCode(node.value) : undefined;
  return code === undefined ? node : tagged(node, 'char', { literal: NUMBER, value: String(code) });
}

function labelOf(node) {
  return node.bits === undefined ? undefined : labelOfTag(node);
}

function typedBinary(node) {
  const [left, right] = node.children.map((child) => labelOf(child));
  if (left === undefined || right === undefined) {
    return node;
  }
  if (ARITHMETIC.has(node.value)) {
    return tagged(node, promotedLabel(left, right));
  }
  return SHIFTS.has(node.value) ? tagged(node, promotedLabel(left, 'int')) : node;
}

function typedUnary(node) {
  const operand = labelOf(node.children[0]);
  return UNARY.has(node.value) && operand !== undefined
    ? tagged(node, promotedLabel(operand, 'int'))
    : node;
}

function typedMember(node) {
  const owner = node.children[0];
  const isLimit = owner.kind === 'name' && owner.binding === 'free' && LIMITS.has(owner.value);
  const label = isLimit ? LIMITS.get(owner.value) : undefined;
  if (label === undefined || (node.value !== 'MAX_VALUE' && node.value !== 'MIN_VALUE')) {
    return node.model === 'size' ? tagged(node, 'int') : node;
  }
  const limit = node.value === 'MAX_VALUE' ? maximumOf(label) : minimumOf(label);
  return tagged(
    {
      kind: 'literal',
      literal: NUMBER,
      value: String(limit),
      children: [],
      start: node.start,
      end: node.end,
      text: node.text,
    },
    label,
  );
}

function isMath(callee) {
  const owner = callee.children?.[0];
  return callee.kind === 'member' && owner?.kind === 'name' && MATH.has(owner.value);
}

function typedCall(node) {
  if (node.model === 'size' || node.model === 'index') {
    return tagged(node, 'int');
  }
  const [callee, ...args] = node.children;
  const converted = CONVERSIONS.get(callee.value);
  if (converted !== undefined && callee.kind === 'member' && args.length === 0) {
    const from = labelOf(callee.children[0]);
    return from === undefined ? node : tagged(node, converted, { operation: 'cast' });
  }
  const labels = args.map((arg) => labelOf(arg));
  if (!isMath(callee) || labels.some((label) => label === undefined)) {
    return node;
  }
  if (callee.value === 'abs' && args.length === 1) {
    return tagged(node, promotedLabel(labels[0], 'int'), { operation: 'abs' });
  }
  const isExtreme = (callee.value === 'min' || callee.value === 'max') && args.length === 2;
  return isExtreme ? tagged(node, promotedLabel(labels[0], labels[1])) : node;
}

function typedCast(node, kotlin) {
  const [type, value] = node.children;
  const label = node.value === 'cast' ? labelOfType(type, kotlin) : undefined;
  const isTyped = label !== undefined && labelOf(value) !== undefined;
  return isTyped ? tagged({ ...node, children: [value] }, label, { operation: 'cast' }) : node;
}

/**
 * `tree` with the fixed-width type of each integer expression it can know: names by their declared
 * type, literals, the limits `Integer.MAX_VALUE` and friends, sizes and index searches, casts,
 * `Math.abs`/`min`/`max` and the arithmetic of such operands, which Java promotes to `int` or
 * `long`. A node carries `bits` and `signed`; anything with an operand of unknown type has none.
 */
export function typedTree(tree, { types, kotlin }) {
  const labels = new Map(
    [...types].flatMap(([name, text]) => {
      const label = labelOfType({ kind: 'type', value: text }, kotlin);
      return label === undefined ? [] : [[name, label]];
    }),
  );
  return typedByKind(tree, {
    name: (node) => (node.binding === 'bound' ? tagged(node, labels.get(node.value)) : node),
    literal: (node) => typedLiteral(node, kotlin),
    binary: typedBinary,
    unary: typedUnary,
    member: typedMember,
    call: typedCall,
    expression: (node) => typedCast(node, kotlin),
  });
}
