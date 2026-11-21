import type { WidthLabel, WidthTag } from '../typed/term-types.mts';

const SHORT = 'short';
const LABELS: readonly WidthLabel[] = ['byte', 'short', 'char', 'int', 'long'];
export const WIDTHS: Readonly<Record<WidthLabel, WidthTag>> = Object.freeze({
  byte: { bits: 8, signed: true },
  short: { bits: 16, signed: true },
  char: { bits: 16, signed: false },
  int: { bits: 32, signed: true },
  long: { bits: 64, signed: true },
});

const TYPE_LABELS = new Map<string, WidthLabel>([
  ['byte', 'byte'],
  ['Byte', 'byte'],
  [SHORT, SHORT],
  ['Short', SHORT],
  ['char', 'char'],
  ['Char', 'char'],
  ['Character', 'char'],
  ['int', 'int'],
  ['Int', 'int'],
  ['Integer', 'int'],
  ['long', 'long'],
  ['Long', 'long'],
]);

export function widthLabel(typeName: string): WidthLabel | undefined {
  return TYPE_LABELS.get(typeName);
}

export function promotedLabel(left: string | undefined, right: string | undefined): WidthLabel {
  return left === 'long' || right === 'long' ? 'long' : 'int';
}

export function widthTag(label: WidthLabel): WidthTag {
  return WIDTHS[label];
}

const ONE = BigInt(1);
const TWO = BigInt(2);

export function rangeOfTag({ bits, signed }: WidthTag): {
  readonly min: bigint;
  readonly max: bigint;
} {
  const span = TWO ** BigInt(bits);
  return signed
    ? { min: -(span / TWO), max: span / TWO - ONE }
    : { min: BigInt(0), max: span - ONE };
}

export function minimumOf(label: WidthLabel): bigint {
  return rangeOfTag(WIDTHS[label]).min;
}

export function maximumOf(label: WidthLabel): bigint {
  return rangeOfTag(WIDTHS[label]).max;
}

export function labelOfTag(tag: Partial<WidthTag>): WidthLabel | undefined {
  return LABELS.find(
    (label) => WIDTHS[label].bits === tag.bits && WIDTHS[label].signed === tag.signed,
  );
}
