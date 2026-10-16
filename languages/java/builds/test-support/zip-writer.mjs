import { deflateRawSync } from 'node:zlib';

const WRITERS = {
  2: (buffer, value, offset) => buffer.writeUInt16LE(value, offset),
  4: (buffer, value, offset) => buffer.writeUInt32LE(value, offset),
  8: (buffer, value, offset) => buffer.writeBigUInt64LE(BigInt(value), offset),
};

function header(fields) {
  const buffer = Buffer.alloc(fields.reduce((size, [bytes]) => size + bytes, 0));
  fields.reduce((offset, [bytes, value]) => {
    WRITERS[bytes](buffer, value, offset);
    return offset + bytes;
  }, 0);
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

function directoryEntry({ nameBytes, stored, data, method }, localOffset, { zip64, wideSizes }) {
  const wide = [
    ...(wideSizes ? [data.length, stored.length] : []),
    ...(zip64 ? [localOffset] : []),
  ];
  const extra =
    wide.length === 0
      ? Buffer.alloc(0)
      : header([[2, 1], [2, 8 * wide.length], ...wide.map((value) => [8, value])]);
  return Buffer.concat([
    header([
      [4, 0x02014b50],
      [2, 20],
      [2, 20],
      [2, 0],
      [2, method],
      [4, 0],
      [4, 0],
      [4, wideSizes ? 0xffffffff : stored.length],
      [4, wideSizes ? 0xffffffff : data.length],
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

function endRecords({ count, size, start, zip64, comment }) {
  const end = header([
    [4, 0x06054b50],
    [2, 0],
    [2, 0],
    [2, zip64 ? 0xffff : count],
    [2, zip64 ? 0xffff : count],
    [4, size],
    [4, zip64 ? 0xffffffff : start],
    [2, Buffer.byteLength(comment)],
  ]);
  if (!zip64) {
    return Buffer.concat([end, Buffer.from(comment)]);
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
  return Buffer.concat([record, locator, end, Buffer.from(comment)]);
}

export function zipOf(files, { zip64 = false, wideSizes = false, comment = '' } = {}) {
  const entries = Object.entries(files).map(([name, text], index) => ({
    name,
    data: typeof text === 'string' ? Buffer.from(text) : text,
    method: index % 2 === 0 ? 8 : 0,
  }));
  const written = entries.map((entry) => ({ ...localEntry(entry), method: entry.method }));
  const offsets = written.reduce((list, { local }) => [...list, list.at(-1) + local.length], [0]);
  const central = Buffer.concat(
    written.map((entry, index) => directoryEntry(entry, offsets[index], { zip64, wideSizes })),
  );
  return Buffer.concat([
    ...written.map(({ local }) => local),
    central,
    endRecords({
      count: entries.length,
      size: central.length,
      start: offsets.at(-1),
      zip64,
      comment,
    }),
  ]);
}
