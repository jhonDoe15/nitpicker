import { readFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';

const END_OF_DIRECTORY = 0x06054b50;
const END_SIZE = 22;
const ZIP64_LOCATOR = 0x07064b50;
const ZIP64_LOCATOR_SIZE = 20;
const ZIP64_END = 0x06064b50;
const ZIP64_END_SIZE = 56;
const DIRECTORY_ENTRY = 0x02014b50;
const LOCAL_HEADER = 0x04034b50;
const ZIP64_EXTRA = 0x0001;
const MAX_COMMENT = 0xffff;
const MAX_TRAILING = 0x10000;
const WIDE = 0xffffffff;
const STORED = 0;
const DEFLATED = 8;
const U64 = 8;
const EXTRA_HEADER = 4;
const END_FIELDS = { entryCount: 10, directorySize: 12, directoryStart: 16, commentLength: 20 };
const ZIP64_LOCATOR_FIELDS = { endOffset: 8 };
const ZIP64_END_FIELDS = { entryCount: 32, directoryStart: 48 };
const ENTRY_FIELDS = {
  method: 10,
  compressedSize: 20,
  size: 24,
  nameLength: 28,
  extraLength: 30,
  commentLength: 32,
  localOffset: 42,
  name: 46,
};
const LOCAL_FIELDS = { nameLength: 26, extraLength: 28, name: 30 };

function endRecordFits(buffer, offset) {
  return (
    buffer.readUInt32LE(offset) === END_OF_DIRECTORY &&
    offset + END_SIZE + buffer.readUInt16LE(offset + END_FIELDS.commentLength) <= buffer.length
  );
}

function isEndOfDirectory(buffer, offset) {
  return (
    offset + END_SIZE + buffer.readUInt16LE(offset + END_FIELDS.commentLength) === buffer.length
  );
}

function endOfDirectory(buffer) {
  const last = buffer.length - END_SIZE;
  const window = last < 0 ? 0 : Math.min(last, MAX_COMMENT + MAX_TRAILING) + 1;
  const candidates = Array.from({ length: window }, (_, back) => last - back).filter((offset) =>
    endRecordFits(buffer, offset),
  );
  const offset =
    candidates.find((candidate) => isEndOfDirectory(buffer, candidate)) ?? candidates[0];
  if (offset === undefined) {
    throw new Error('not a zip archive: no end of central directory record');
  }
  return offset;
}

function zip64Directory(buffer, locator) {
  const recorded = Number(buffer.readBigUInt64LE(locator + ZIP64_LOCATOR_FIELDS.endOffset));
  const zip64End = [recorded, locator - ZIP64_END_SIZE].find(
    (offset) => offset >= 0 && offset < locator && buffer.readUInt32LE(offset) === ZIP64_END,
  );
  if (zip64End === undefined) {
    throw new Error('zip64 archive without a zip64 end of central directory record');
  }
  const prefix = zip64End - recorded;
  return {
    start: Number(buffer.readBigUInt64LE(zip64End + ZIP64_END_FIELDS.directoryStart)),
    count: Number(buffer.readBigUInt64LE(zip64End + ZIP64_END_FIELDS.entryCount)),
    prefix,
  };
}

function directoryStart(buffer) {
  const end = endOfDirectory(buffer);
  const locator = end - ZIP64_LOCATOR_SIZE;
  if (locator >= 0 && buffer.readUInt32LE(locator) === ZIP64_LOCATOR) {
    return zip64Directory(buffer, locator);
  }
  const size = buffer.readUInt32LE(end + END_FIELDS.directorySize);
  const start = buffer.readUInt32LE(end + END_FIELDS.directoryStart);
  const count = buffer.readUInt16LE(end + END_FIELDS.entryCount);
  return { start, count, prefix: end - size - start };
}

function extraFields(buffer, { offset, end }) {
  const starts = [offset];
  const fields = [];
  for (const start of starts) {
    if (start + EXTRA_HEADER <= end) {
      const size = buffer.readUInt16LE(start + 2);
      fields.push({ id: buffer.readUInt16LE(start), start: start + EXTRA_HEADER, size });
      starts.push(start + EXTRA_HEADER + size);
    }
  }
  return fields;
}

function zip64Values(buffer, range) {
  const field = extraFields(buffer, range).find(({ id }) => id === ZIP64_EXTRA);
  return field === undefined
    ? []
    : Array.from({ length: Math.floor(field.size / U64) }, (_, index) =>
        Number(buffer.readBigUInt64LE(field.start + U64 * index)),
      );
}

function readEntry(buffer, { offset, prefix }) {
  if (buffer.readUInt32LE(offset) !== DIRECTORY_ENTRY) {
    throw new Error(`broken zip central directory at byte ${String(offset)}`);
  }
  const nameLength = buffer.readUInt16LE(offset + ENTRY_FIELDS.nameLength);
  const extraLength = buffer.readUInt16LE(offset + ENTRY_FIELDS.extraLength);
  const extraStart = offset + ENTRY_FIELDS.name + nameLength;
  const wide = zip64Values(buffer, { offset: extraStart, end: extraStart + extraLength });
  const [, compressedSize, localOffset] = [
    ENTRY_FIELDS.size,
    ENTRY_FIELDS.compressedSize,
    ENTRY_FIELDS.localOffset,
  ]
    .map((field) => buffer.readUInt32LE(offset + field))
    .map((value) => (value === WIDE ? wide.shift() : value));
  return {
    entry: {
      name: buffer.toString('utf8', offset + ENTRY_FIELDS.name, extraStart),
      method: buffer.readUInt16LE(offset + ENTRY_FIELDS.method),
      compressedSize,
      localOffset: localOffset + prefix,
    },
    next: extraStart + extraLength + buffer.readUInt16LE(offset + ENTRY_FIELDS.commentLength),
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
    LOCAL_FIELDS.name +
    buffer.readUInt16LE(entry.localOffset + LOCAL_FIELDS.nameLength) +
    buffer.readUInt16LE(entry.localOffset + LOCAL_FIELDS.extraLength);
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

export function readZipOrFailure(file) {
  try {
    return { kind: 'zip', zip: readZip(file) };
  } catch (error) {
    return { kind: 'unreadable', error };
  }
}
