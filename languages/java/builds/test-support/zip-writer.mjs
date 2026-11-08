import { deflateRawSync } from 'node:zlib';

const U16 = 2;
const U32 = 4;
const U64 = 8;
const LOCAL_HEADER = 0x04034b50;
const DIRECTORY_ENTRY = 0x02014b50;
const END_OF_DIRECTORY = 0x06054b50;
const ZIP64_END = 0x06064b50;
const ZIP64_LOCATOR = 0x07064b50;
const VERSION = 20;
const ZIP64_VERSION = 45;
const ZIP64_END_REST = 44;
const ZIP64_EXTRA = 1;
const STORED = 0;
const DEFLATED = 8;
const WIDE16 = 0xffff;
const WIDE32 = 0xffffffff;
const WRITERS = {
  [U16]: (buffer, value, offset) => buffer.writeUInt16LE(value, offset),
  [U32]: (buffer, value, offset) => buffer.writeUInt32LE(value, offset),
  [U64]: (buffer, value, offset) => buffer.writeBigUInt64LE(BigInt(value), offset),
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
  const stored = method === DEFLATED ? deflateRawSync(data) : data;
  const nameBytes = Buffer.from(name);
  const local = Buffer.concat([
    header([
      [U32, LOCAL_HEADER],
      [U16, VERSION],
      [U16, 0],
      [U16, method],
      [U32, 0],
      [U32, 0],
      [U32, stored.length],
      [U32, data.length],
      [U16, nameBytes.length],
      [U16, 0],
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
      : header([
          [U16, ZIP64_EXTRA],
          [U16, U64 * wide.length],
          ...wide.map((value) => [U64, value]),
        ]);
  return Buffer.concat([
    header([
      [U32, DIRECTORY_ENTRY],
      [U16, VERSION],
      [U16, VERSION],
      [U16, 0],
      [U16, method],
      [U32, 0],
      [U32, 0],
      [U32, wideSizes ? WIDE32 : stored.length],
      [U32, wideSizes ? WIDE32 : data.length],
      [U16, nameBytes.length],
      [U16, extra.length],
      [U16, 0],
      [U16, 0],
      [U16, 0],
      [U32, 0],
      [U32, zip64 ? WIDE32 : localOffset],
    ]),
    nameBytes,
    extra,
  ]);
}

function endRecords({ count, size, start, zip64, comment }) {
  const end = header([
    [U32, END_OF_DIRECTORY],
    [U16, 0],
    [U16, 0],
    [U16, zip64 ? WIDE16 : count],
    [U16, zip64 ? WIDE16 : count],
    [U32, size],
    [U32, zip64 ? WIDE32 : start],
    [U16, Buffer.byteLength(comment)],
  ]);
  if (!zip64) {
    return Buffer.concat([end, Buffer.from(comment)]);
  }
  const record = header([
    [U32, ZIP64_END],
    [U64, ZIP64_END_REST],
    [U16, ZIP64_VERSION],
    [U16, ZIP64_VERSION],
    [U32, 0],
    [U32, 0],
    [U64, count],
    [U64, count],
    [U64, size],
    [U64, start],
  ]);
  const locator = header([
    [U32, ZIP64_LOCATOR],
    [U32, 0],
    [U64, start + size],
    [U32, 1],
  ]);
  return Buffer.concat([record, locator, end, Buffer.from(comment)]);
}

export function zipOf(files, { zip64 = false, wideSizes = false, comment = '' } = {}) {
  const entries = Object.entries(files).map(([name, text], index) => ({
    name,
    data: typeof text === 'string' ? Buffer.from(text) : text,
    method: index % 2 === 0 ? DEFLATED : STORED,
  }));
  const written = entries.map((entry) => ({ ...localEntry(entry), method: entry.method }));
  const offsets = [0];
  for (const { local } of written) {
    offsets.push(offsets.at(-1) + local.length);
  }
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
