/** The fixed-width integer types of the JVM, by the name the solver terms give them. */
export const WIDTHS = Object.freeze({
  byte: { bits: 8, signed: true },
  short: { bits: 16, signed: true },
  char: { bits: 16, signed: false },
  int: { bits: 32, signed: true },
  long: { bits: 64, signed: true },
});

const TYPE_LABELS = new Map([
  ['byte', 'byte'],
  ['Byte', 'byte'],
  ['short', 'short'],
  ['Short', 'short'],
  ['char', 'char'],
  ['Char', 'char'],
  ['Character', 'char'],
  ['int', 'int'],
  ['Int', 'int'],
  ['Integer', 'int'],
  ['long', 'long'],
  ['Long', 'long'],
]);

/** The width label of a declared type name (`Integer` is `int`), or undefined. */
export function widthLabel(typeName) {
  return TYPE_LABELS.get(typeName);
}

/** Binary numeric promotion: `long` when either side is, otherwise `int`. */
export function promotedLabel(left, right) {
  return left === 'long' || right === 'long' ? 'long' : 'int';
}

/** The tag a term node carries for `label`: `{ bits, signed }`. */
export function widthTag(label) {
  return WIDTHS[label];
}

export function minimumOf(label) {
  const { bits, signed } = WIDTHS[label];
  return signed ? -(2n ** BigInt(bits - 1)) : 0n;
}

export function maximumOf(label) {
  const { bits, signed } = WIDTHS[label];
  return signed ? 2n ** BigInt(bits - 1) - 1n : 2n ** BigInt(bits) - 1n;
}

/** The label of a `{ bits, signed }` tag, or undefined for a node without one. */
export function labelOfTag(tag) {
  return Object.entries(WIDTHS).find(
    ([, { bits, signed }]) => bits === tag.bits && signed === tag.signed,
  )?.[0];
}
