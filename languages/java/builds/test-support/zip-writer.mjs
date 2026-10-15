import { deflateRawSync } from 'node:zlib';

function header(fields) {
  const buffer = Buffer.alloc(fields.reduce((size, [bytes]) => size + bytes, 0));
  let offset = 0;
  for (const [bytes, value] of fields) {
    if (bytes === 2) {
      buffer.writeUInt16LE(value, offset);
    } else if (bytes === 4) {
      buffer.writeUInt32LE(value, offset);
    } else {
      buffer.writeBigUInt64LE(BigInt(value), offset);
    }
    offset += bytes;
  }
  return buffer;
}

function localEntry({ name, data, method }) {
  const stored = method === 8 ? deflateRawSync(data) : data;
  const nameBytes = Buffer.from(name);
  const local = Buffer.concat([
    header([
      [4, 0x04034b50],
      [2, 20],
      [2, 0],
      [2, method],
      [4, 0],
      [4, 0],
      [4, stored.length],
      [4, data.length],
      [2, nameBytes.length],
      [2, 0],
    ]),
    nameBytes,
    stored,
  ]);
  return { local, nameBytes, stored, data };
}

function directoryEntry({ nameBytes, stored, data, method }, localOffset, zip64) {
  const extra = zip64 ? header([[2, 1], [2, 8], [8, localOffset]]) : Buffer.alloc(0);
  return Buffer.concat([
    header([
      [4, 0x02014b50],
      [2, 20],
      [2, 20],
      [2, 0],
      [2, method],
      [4, 0],
      [4, 0],
      [4, stored.length],
      [4, data.length],
      [2, nameBytes.length],
      [2, extra.length],
      [2, 0],
      [2, 0],
      [2, 0],
      [4, 0],
      [4, zip64 ? 0xffffffff : localOffset],
    ]),
    nameBytes,
    extra,
  ]);
}

function endRecords({ count, size, start, zip64 }) {
  const end = header([
    [4, 0x06054b50],
    [2, 0],
    [2, 0],
    [2, zip64 ? 0xffff : count],
    [2, zip64 ? 0xffff : count],
    [4, size],
    [4, zip64 ? 0xffffffff : start],
    [2, 0],
  ]);
  if (!zip64) {
    return end;
  }
  const record = header([
    [4, 0x06064b50],
    [8, 44],
    [2, 45],
    [2, 45],
    [4, 0],
    [4, 0],
    [8, count],
    [8, count],
    [8, size],
    [8, start],
  ]);
  const locator = header([
    [4, 0x07064b50],
    [4, 0],
    [8, start + size],
    [4, 1],
  ]);
  return Buffer.concat([record, locator, end]);
}

export function zipOf(files, { zip64 = false } = {}) {
  const entries = Object.entries(files).map(([name, text], index) => ({
    name,
    data: Buffer.from(text),
    method: index % 2 === 0 ? 8 : 0,
  }));
  const locals = [];
  const directory = [];
  let offset = 0;
  for (const entry of entries) {
    const written = localEntry(entry);
    directory.push(directoryEntry({ ...written, method: entry.method }, offset, zip64));
    locals.push(written.local);
    offset += written.local.length;
  }
  const central = Buffer.concat(directory);
  return Buffer.concat([
    ...locals,
    central,
    endRecords({ count: entries.length, size: central.length, start: offset, zip64 }),
  ]);
}
