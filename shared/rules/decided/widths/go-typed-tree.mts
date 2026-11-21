import { chainOf } from '../../../traversal.mts';
import { withWidth } from '../typed/width-tag.mts';
import { rangeOfTag } from '../../../logic/bitvectors/widths.mts';
import { goIntegerWidth } from '../../../near-duplicates/proof/integer-types.mts';
import { present } from '../../../near-duplicates/tree/nodes.mts';
import type { FlowNode, ModelScope } from '../typed/decided-types.mts';
import { tagOf, typedByKind } from './typed-dispatch.mts';

type Tag = { readonly bits: number; readonly signed: boolean };
type Unified = { readonly tag: Tag; readonly operands: FlowNode[] };
type Radix = readonly [RegExp, string];

const ARITHMETIC = new Set(['+', '-', '*', '/', '%', '&', '|', '^']);
const COMPARISONS = new Set(['<', '<=', '>', '>=', '==', '!=']);
const UNARY = new Set(['-', '+', '~']);
const SIZE = Object.freeze({ bits: 64, signed: true });
const RADIX: readonly Radix[] = [
  [/^0x(?<digits>[\da-f_]+)$/iu, '0x'],
  [/^0b(?<digits>[01_]+)$/iu, '0b'],
  [/^0o(?<digits>[0-7_]+)$/iu, '0o'],
  [/^0(?<digits>[0-7_]+)$/u, '0o'],
  [/^(?<digits>\d[\d_]*)$/u, ''],
];

function tagged(
  node: FlowNode,
  tag: Tag | undefined,
  fields: { readonly operation?: string } = {},
): FlowNode {
  return tag === undefined ? node : withWidth({ ...node, ...fields }, tag);
}

function fits(value: bigint, { bits, signed }: Tag): boolean {
  const { min, max } = rangeOfTag({ bits, signed });
  return value >= min && value <= max;
}

function numberValue(text: string): bigint | undefined {
  const [pattern, prefix] = RADIX.find(([form]) => form.test(text)) ?? [];
  return pattern === undefined
    ? undefined
    : BigInt(
        `${prefix ?? ''}${present(pattern.exec(text)?.groups?.['digits']).replaceAll('_', '')}`,
      );
}

function isSign(node: FlowNode): boolean {
  return node.kind === 'unary' && (node.value === '-' || node.value === '+');
}

function constantOf(node: FlowNode): bigint | undefined {
  const signs: FlowNode[] = chainOf(node, (current: FlowNode) =>
    isSign(current) ? current.children[0] : undefined,
  );
  const current = present(signs.at(-1));
  const negative = signs.slice(0, -1).filter((sign) => sign.value === '-').length % 2 === 1;
  const isNumber = current.kind === 'literal' && current.literal === 'number';
  const value =
    isNumber && current.bits === undefined ? numberValue(present(current.value)) : undefined;
  return value !== undefined && negative ? -value : value;
}

function typedConstant(node: FlowNode, tag: Tag): FlowNode | undefined {
  const value = constantOf(node);
  if (value === undefined || !fits(value, tag)) {
    return undefined;
  }
  const literal = { ...node, kind: 'literal', literal: 'number', value: String(value) };
  return tagged({ ...literal, children: [] }, tag);
}

function unifiedOperands(node: FlowNode): Unified | undefined {
  const tags = node.children.map((child) => tagOf(child)).filter((tag) => tag !== undefined);
  const [tag] = tags;
  if (
    tag === undefined ||
    tags.some((other) => other.bits !== tag.bits || other.signed !== tag.signed)
  ) {
    return undefined;
  }
  const operands = node.children.map((child) => (tagOf(child) ? child : typedConstant(child, tag)));
  return operands.every((operand): operand is FlowNode => operand !== undefined)
    ? { tag, operands }
    : undefined;
}

function typedBinary(node: FlowNode): FlowNode {
  const isArithmetic = node.value !== undefined && ARITHMETIC.has(node.value);
  const unified =
    isArithmetic || (node.value !== undefined && COMPARISONS.has(node.value))
      ? unifiedOperands(node)
      : undefined;
  if (unified === undefined) {
    return node;
  }
  const rebuilt = { ...node, children: unified.operands };
  return isArithmetic ? tagged(rebuilt, unified.tag) : rebuilt;
}

function typedUnary(node: FlowNode): FlowNode {
  return node.value !== undefined && UNARY.has(node.value)
    ? tagged(node, tagOf(present(node.children[0])))
    : node;
}

function typedCast(node: FlowNode): FlowNode {
  const [type, value] = node.children;
  const target =
    node.value === 'cast' && type?.kind === 'type'
      ? goIntegerWidth(present(type.value))
      : undefined;
  if (target === undefined || value === undefined) {
    return node;
  }
  if (tagOf(value) !== undefined) {
    return tagged({ ...node, children: [value] }, target, { operation: 'cast' });
  }
  return typedConstant(value, target) ?? node;
}

export function goTypedTree(tree: FlowNode, { types }: Pick<ModelScope, 'types'>): FlowNode {
  const labels = new Map<string, Tag>(
    [...types].flatMap(([name, text]): [string, Tag][] => {
      const width = goIntegerWidth(text);
      return width === undefined ? [] : [[name, width]];
    }),
  );
  return typedByKind(tree, {
    name: (node) =>
      node.binding === 'bound' && node.value !== undefined
        ? tagged(node, labels.get(node.value))
        : node,
    binary: typedBinary,
    unary: typedUnary,
    expression: typedCast,
    call: (node) => (node.model === 'size' ? tagged(node, SIZE) : node),
  });
}
