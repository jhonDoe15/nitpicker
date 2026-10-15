import { readFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';

const END_OF_DIRECTORY = Buffer.from([0x50, 0x4b, 0x05, 0x06]);
const END_SIZE = 22;
const ZIP64_LOCATOR = 0x07064b50;
const ZIP64_LOCATOR_SIZE = 20;
const ZIP64_END = 0x06064b50;
const DIRECTORY_ENTRY = 0x02014b50;
const LOCAL_HEADER = 0x04034b50;
const ZIP64_EXTRA = 0x0001;
const MAX_COMMENT = 0xffff;
const WIDE = 0xffffffff;
const STORED = 0;
const DEFLATED = 8;

function isEndOfDirectory(buffer, offset) {
  return (
    offset + END_SIZE <= buffer.length &&
    offset + END_SIZE + buffer.readUInt16LE(offset + 20) === buffer.length
  );
}

function endOfDirectory(buffer) {
  const pending = [buffer.lastIndexOf(END_OF_DIRECTORY)];
  for (const offset of pending) {
    if (offset < 0 || offset < buffer.length - END_SIZE - MAX_COMMENT) {
      throw new Error('not a zip archive: no end of central directory record');
    }
    if (isEndOfDirectory(buffer, offset)) {
      return offset;
    }
    pending.push(offset === 0 ? -1 : buffer.lastIndexOf(END_OF_DIRECTORY, offset - 1));
  }
  return -1;
}

function zip64Directory(buffer, locator) {
  const zip64End = Number(buffer.readBigUInt64LE(locator + 8));
  if (buffer.readUInt32LE(zip64End) !== ZIP64_END) {
    throw new Error('zip64 archive without a zip64 end of central directory record');
  }
  return {
    start: Number(buffer.readBigUInt64LE(zip64End + 48)),
    count: Number(buffer.readBigUInt64LE(zip64End + 32)),
    prefix: 0,
  };
}

function directoryStart(buffer) {
  const end = endOfDirectory(buffer);
  const locator = end - ZIP64_LOCATOR_SIZE;
  if (locator >= 0 && buffer.readUInt32LE(locator) === ZIP64_LOCATOR) {
    return zip64Directory(buffer, locator);
  }
  const size = buffer.readUInt32LE(end + 12);
  const start = buffer.readUInt32LE(end + 16);
  return { start, count: buffer.readUInt16LE(end + 10), prefix: end - size - start };
}

function extraFields(buffer, { offset, end }) {
  const starts = [offset];
  const fields = [];
  for (const start of starts) {
    if (start + 4 <= end) {
      const size = buffer.readUInt16LE(start + 2);
      fields.push({ id: buffer.readUInt16LE(start), start: start + 4, size });
      starts.push(start + 4 + size);
    }
  }
  return fields;
}

function zip64Values(buffer, range) {
  const field = extraFields(buffer, range).find(({ id }) => id === ZIP64_EXTRA);
  return field === undefined
    ? []
    : Array.from({ length: Math.floor(field.size / 8) }, (_, index) =>
        Number(buffer.readBigUInt64LE(field.start + 8 * index)),
      );
}

function readEntry(buffer, { offset, prefix }) {
  if (buffer.readUInt32LE(offset) !== DIRECTORY_ENTRY) {
    throw new Error(`broken zip central directory at byte ${String(offset)}`);
  }
  const nameLength = buffer.readUInt16LE(offset + 28);
  const extraLength = buffer.readUInt16LE(offset + 30);
  const extraStart = offset + 46 + nameLength;
  const wide = zip64Values(buffer, { offset: extraStart, end: extraStart + extraLength });
  const [, compressedSize, localOffset] = [24, 20, 42]
    .map((field) => buffer.readUInt32LE(offset + field))
    .map((value) => (value === WIDE ? wide.shift() : value));
  return {
    entry: {
      name: buffer.toString('utf8', offset + 46, extraStart),
      method: buffer.readUInt16LE(offset + 10),
      compressedSize,
      localOffset: localOffset + prefix,
    },
    next: extraStart + extraLength + buffer.readUInt16LE(offset + 32),
  };
}

function zipDirectory(buffer) {
  const { start, count, prefix } = directoryStart(buffer);
  return Array.from({ length: count }).reduce(
    (state) => {
      const { entry, next } = readEntry(buffer, { offset: state.offset, prefix });
      state.entries.push(entry);
      state.offset = next;
      return state;
    },
    { offset: start + prefix, entries: [] },
  ).entries;
}

function zipEntryText(buffer, entry) {
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
