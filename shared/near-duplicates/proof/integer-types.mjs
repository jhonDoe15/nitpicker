const GO_INTEGER_WIDTHS = new Map([
  ['int', { bits: 64, signed: true }],
  ['int8', { bits: 8, signed: true }],
  ['int16', { bits: 16, signed: true }],
  ['int32', { bits: 32, signed: true }],
  ['rune', { bits: 32, signed: true }],
  ['int64', { bits: 64, signed: true }],
  ['uint', { bits: 64, signed: false }],
  ['uint8', { bits: 8, signed: false }],
  ['byte', { bits: 8, signed: false }],
  ['uint16', { bits: 16, signed: false }],
  ['uint32', { bits: 32, signed: false }],
  ['uint64', { bits: 64, signed: false }],
  ['uintptr', { bits: 64, signed: false }],
]);

export function goIntegerWidth(name) {
  return GO_INTEGER_WIDTHS.get(name);
}

export function goIntegerNames() {
  return [...GO_INTEGER_WIDTHS.keys()];
}
