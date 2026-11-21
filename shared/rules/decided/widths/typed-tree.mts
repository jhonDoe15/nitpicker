import {
  labelOfTag,
  maximumOf,
  minimumOf,
  promotedLabel,
  rangeOfTag,
  widthLabel,
  widthTag,
} from '../../../logic/bitvectors/widths.mts';
import { isOneOf, placed, present } from '../../../near-duplicates/tree/nodes.mts';
import type { WidthLabel } from '../../../logic/typed/term-types.mts';
import type { FlowNode, ModelScope } from '../typed/decided-types.mts';
import { withWidth } from '../typed/width-tag.mts';
import { typedByKind } from './typed-dispatch.mts';

type Fields = { readonly value?: string; readonly literal?: string; readonly operation?: string };

const NUMBER = 'number';

const ARITHMETIC = new Set(['+', '-', '*', '/', '%', '&', '|', '^']);
const SHIFTS = new Set(['<<', '>>', '>>>']);
const UNARY = new Set(['-', '+', '~']);
const MATH = new Set(['Math', 'StrictMath']);
const CONVERSIONS = new Map<string, WidthLabel>([
  ['toInt', 'int'],
  ['toLong', 'long'],
  ['toShort', 'short'],
  ['toByte', 'byte'],
]);
const LIMITS = new Map<string, WidthLabel>([
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
const RADIX: readonly (readonly [RegExp, string])[] = [
  [/^0x(?<digits>[\da-f_]+)$/iu, '0x'],
  [/^0b(?<digits>[01_]+)$/iu, '0b'],
  [/^0(?<digits>[0-7_]+)$/u, '0o'],
  [/^(?<digits>\d[\d_]*)$/u, ''],
];
const LONG_SUFFIX = /[lL]$/u;
const UNICODE = /^'\\u(?<code>[\da-fA-F]{4})'$/u;
const PLAIN = /^'(?<char>[^\\'])'$/u;

function labelOfType(type: FlowNode | undefined, kotlin: boolean): WidthLabel | undefined {
  const text = type?.kind === 'type' ? present(type.value).replace(/\?$/u, '').trim() : '';
  const label = widthLabel(text);
  return kotlin && label === 'char' ? undefined : label;
}

function tagged(node: FlowNode, label: WidthLabel | undefined, fields: Fields = {}): FlowNode {
  return label === undefined ? node : withWidth({ ...node, ...fields }, widthTag(label));
}

function numberLabel(text: string): { label: WidthLabel; value: string } | undefined {
  const isLong = LONG_SUFFIX.test(text);
  const bare = text.replace(LONG_SUFFIX, '');
  const [pattern, prefix] = RADIX.find(([form]) => form.test(bare)) ?? [];
  if (pattern === undefined) {
    return undefined;
  }
  const digits = present(pattern.exec(bare)?.groups?.['digits']);
  const value = BigInt(`${prefix ?? ''}${digits.replaceAll('_', '')}`);
  const label: WidthLabel = isLong ? 'long' : 'int';
  const isHex = prefix !== undefined && prefix !== '';
  const unsigned = rangeOfTag({ bits: widthTag(label).bits, signed: false });
  const limit = isHex ? unsigned.max : maximumOf(label) + BigInt(1);
  return value <= limit ? { label, value: String(value) } : undefined;
}

function charCode(text: string): number | undefined {
  const plain = PLAIN.exec(text)?.groups?.['char'];
  if (plain !== undefined) {
    return plain.codePointAt(0);
  }
  const unicode = UNICODE.exec(text)?.groups?.['code'];
  return unicode === undefined ? ESCAPES.get(text.slice(1, -1)) : Number.parseInt(unicode, 16);
}

function typedLiteral(node: FlowNode, kotlin: boolean): FlowNode {
  if (node.literal === NUMBER) {
    const found = numberLabel(present(node.value));
    return found === undefined ? node : tagged(node, found.label, { value: found.value });
  }
  const code = node.literal === 'char' && !kotlin ? charCode(present(node.value)) : undefined;
  return code === undefined ? node : tagged(node, 'char', { literal: NUMBER, value: String(code) });
}

function labelOf(node: FlowNode): WidthLabel | undefined {
  return node.bits === undefined ? undefined : labelOfTag(node);
}

function typedBinary(node: FlowNode): FlowNode {
  const [left, right] = node.children.map((child) => labelOf(child));
  if (left === undefined || right === undefined) {
    return node;
  }
  if (isOneOf(ARITHMETIC, node.value)) {
    return tagged(node, promotedLabel(left, right));
  }
  return isOneOf(SHIFTS, node.value) ? tagged(node, promotedLabel(left, 'int')) : node;
}

function typedUnary(node: FlowNode): FlowNode {
  const operand = labelOf(present(node.children[0]));
  return isOneOf(UNARY, node.value) && operand !== undefined
    ? tagged(node, promotedLabel(operand, 'int'))
    : node;
}

function typedMember(node: FlowNode): FlowNode {
  const owner = present(node.children[0]);
  const label =
    owner.kind === 'name' && owner.binding === 'free' && owner.value !== undefined
      ? LIMITS.get(owner.value)
      : undefined;
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
      ...placed(node.start, node.end),
      ...(node.text === undefined ? {} : { text: node.text }),
    },
    label,
  );
}

function isMath(callee: FlowNode): boolean {
  const owner = callee.children[0];
  return callee.kind === 'member' && owner?.kind === 'name' && isOneOf(MATH, owner.value);
}

function typedCall(node: FlowNode): FlowNode {
  if (node.model === 'size' || node.model === 'index') {
    return tagged(node, 'int');
  }
  const [rawCallee, ...args] = node.children;
  const callee = present(rawCallee);
  const converted = callee.value === undefined ? undefined : CONVERSIONS.get(callee.value);
  if (converted !== undefined && callee.kind === 'member' && args.length === 0) {
    const from = labelOf(present(callee.children[0]));
    return from === undefined ? node : tagged(node, converted, { operation: 'cast' });
  }
  const labels = args.map((arg) => labelOf(arg));
  if (!isMath(callee) || labels.some((label) => label === undefined)) {
    return node;
  }
  if (callee.value === 'abs' && args.length === 1) {
    return tagged(node, promotedLabel(present(labels[0]), 'int'), { operation: 'abs' });
  }
  const isExtreme = (callee.value === 'min' || callee.value === 'max') && args.length === 2;
  return isExtreme ? tagged(node, promotedLabel(present(labels[0]), present(labels[1]))) : node;
}

function typedCast(node: FlowNode, kotlin: boolean): FlowNode {
  const [type, value] = node.children;
  const label = node.value === 'cast' ? labelOfType(type, kotlin) : undefined;
  const isTyped = label !== undefined && value !== undefined && labelOf(value) !== undefined;
  return isTyped ? tagged({ ...node, children: [value] }, label, { operation: 'cast' }) : node;
}

export function typedTree(
  tree: FlowNode,
  { types, kotlin }: Pick<ModelScope, 'types' | 'kotlin'>,
): FlowNode {
  const labels = new Map<string, WidthLabel>(
    [...types].flatMap(([name, text]): [string, WidthLabel][] => {
      const label = labelOfType({ kind: 'type', value: text, children: [] }, kotlin);
      return label === undefined ? [] : [[name, label]];
    }),
  );
  return typedByKind(tree, {
    name: (node) =>
      node.binding === 'bound' && node.value !== undefined
        ? tagged(node, labels.get(node.value))
        : node,
    literal: (node) => typedLiteral(node, kotlin),
    binary: typedBinary,
    unary: typedUnary,
    member: typedMember,
    call: typedCall,
    expression: (node) => typedCast(node, kotlin),
  });
}
