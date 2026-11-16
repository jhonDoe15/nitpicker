const UTF8_HEADER_BYTES = 3;

export function utf8(text: string): Buffer {
  const bytes = Buffer.from(text, 'utf8');
  const header = Buffer.alloc(UTF8_HEADER_BYTES);
  header[0] = 1;
  header.writeUInt16BE(bytes.length, 1);
  return Buffer.concat([header, bytes]);
}

export function u16(...values: number[]): Buffer {
  const buffer = Buffer.alloc(2 * values.length);
  for (const [index, value] of values.entries()) {
    buffer.writeUInt16BE(value, 2 * index);
  }
  return buffer;
}
