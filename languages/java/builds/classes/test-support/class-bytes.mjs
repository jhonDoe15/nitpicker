const UTF8_TAG = 1;
const HEADER = [0xca, 0xfe, 0xba, 0xbe, 0x00, 0x00, 0x00, 0x41];

function utf8Constant(text) {
  const bytes = Buffer.from(text, 'utf8');
  const length = Buffer.alloc(2);
  length.writeUInt16BE(bytes.length);
  return Buffer.concat([Buffer.from([UTF8_TAG]), length, bytes]);
}

export function classWithStrings(strings) {
  const count = Buffer.alloc(2);
  count.writeUInt16BE(strings.length + 1);
  return Buffer.concat([Buffer.from(HEADER), count, ...strings.map(utf8Constant)]);
}

export function descriptorOfLength(length, packagePath) {
  const simpleLength = length - packagePath.length - 3;
  return `L${packagePath}/${'W'.repeat(simpleLength)};`;
}
