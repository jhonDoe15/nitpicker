import { readFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';

const END_OF_DIRECTORY = Buffer.from([0x50, 0x4b, 0x05, 0x06]);
const ZIP64_LOCATOR = 0x07064b50;
const ZIP64_END = 0x06064b50;
const DIRECTORY_ENTRY = 0x02014b50;
const LOCAL_HEADER = 0x04034b50;
const ZIP64_EXTRA = 0x0001;
const MAX_COMMENT = 0xffff;
const STORED = 0;
const DEFLATED = 8;

function endOfDirectory(buffer) {
  const offset = buffer.lastIndexOf(END_OF_DIRECTORY);
  if (offset < 0 || offset < buffer.length - 22 - MAX_COMMENT) {
    throw new Error('not a zip archive: no end of central directory record');
  }
  return offset;
}

function directoryStart(buffer) {
  const end = endOfDirectory(buffer);
  const count = buffer.readUInt16LE(end + 10);
  const start = buffer.readUInt32LE(end + 16);
  if (count !== 0xffff && start !== 0xffffffff) {
    return { start, count };
  }
  const locator = end - 20;
  if (locator < 0 || buffer.readUInt32LE(locator) !== ZIP64_LOCATOR) {
    throw new Error('zip64 archive without a zip64 end of central directory locator');
  }
  const zip64End = Number(buffer.readBigUInt64LE(locator + 8));
  if (buffer.readUInt32LE(zip64End) !== ZIP64_END) {
    throw new Error('zip64 archive without a zip64 end of central directory record');
  }
  return {
    start: Number(buffer.readBigUInt64LE(zip64End + 48)),
    count: Number(buffer.readBigUInt64LE(zip64End + 32)),
  };
}

function zip64Values(buffer, { extraStart, extraEnd }) {
  for (let offset = extraStart; offset + 4 <= extraEnd; ) {
    const id = buffer.readUInt16LE(offset);
    const size = buffer.readUInt16LE(offset + 2);
    if (id === ZIP64_EXTRA) {
      const values = [];
      for (let value = offset + 4; value + 8 <= offset + 4 + size; value += 8) {
        values.push(Number(buffer.readBigUInt64LE(value)));
      }
      return values;
    }
    offset += 4 + size;
  }
  return [];
}

function readEntry(buffer, offset) {
  if (buffer.readUInt32LE(offset) !== DIRECTORY_ENTRY) {
    throw new Error(`broken zip central directory at byte ${String(offset)}`);
  }
  const nameLength = buffer.readUInt16LE(offset + 28);
  const extraLength = buffer.readUInt16LE(offset + 30);
  const commentLength = buffer.readUInt16LE(offset + 32);
  const extraStart = offset + 46 + nameLength;
  const sizes = [
    buffer.readUInt32LE(offset + 24),
    buffer.readUInt32LE(offset + 20),
    buffer.readUInt32LE(offset + 42),
  ];
  const wide = zip64Values(buffer, { extraStart, extraEnd: extraStart + extraLength });
  const [, compressedSize, localOffset] = sizes.map((value) =>
    value === 0xffffffff ? wide.shift() : value,
  );
  return {
    entry: {
      name: buffer.toString('utf8', offset + 46, extraStart),
      method: buffer.readUInt16LE(offset + 10),
      compressedSize,
      localOffset,
    },
    next: extraStart + extraLength + commentLength,
  };
}

export function zipDirectory(buffer) {
  const { start, count } = directoryStart(buffer);
  const entries = [];
  let offset = start;
  for (let index = 0; index < count; index += 1) {
    const { entry, next } = readEntry(buffer, offset);
    entries.push(entry);
    offset = next;
  }
  return entries;
}

export function zipEntryText(buffer, entry) {
  if (buffer.readUInt32LE(entry.localOffset) !== LOCAL_HEADER) {
    throw new Error(`broken zip local header for ${entry.name}`);
  }
  const dataStart =
    entry.localOffset +
    30 +
    buffer.readUInt16LE(entry.localOffset + 26) +
    buffer.readUInt16LE(entry.localOffset + 28);
  const data = buffer.subarray(dataStart, dataStart + entry.compressedSize);
  if (entry.method === STORED) {
    return data.toString('utf8');
  }
  if (entry.method === DEFLATED) {
    return inflateRawSync(data).toString('utf8');
  }
  throw new Error(`${entry.name} uses zip compression method ${String(entry.method)}`);
}

export function readZip(file) {
  const buffer = readFileSync(file);
  const entries = zipDirectory(buffer);
  return {
    names: new Set(entries.map((entry) => entry.name)),
    text(name) {
      const entry = entries.find((candidate) => candidate.name === name);
      return entry === undefined ? undefined : zipEntryText(buffer, entry);
    },
  };
}
