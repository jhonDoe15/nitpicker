import { closeSync, fstatSync, openSync, readSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';

const END_SIGNATURE = Buffer.from([0x50, 0x4b, 0x05, 0x06]);
const CENTRAL_SIGNATURE = 0x02_01_4b_50;
const LOCAL_SIGNATURE = 0x04_03_4b_50;
const END_RECORD_SIZE = 22;
const END_ENTRY_COUNT = 10;
const END_DIRECTORY_SIZE = 12;
const END_DIRECTORY_OFFSET = 16;
const MAX_COMMENT = 0xff_ff;
const CENTRAL_HEADER_SIZE = 46;
const CENTRAL_METHOD = 10;
const CENTRAL_COMPRESSED_SIZE = 20;
const CENTRAL_NAME_LENGTH = 28;
const CENTRAL_EXTRA_LENGTH = 30;
const CENTRAL_COMMENT_LENGTH = 32;
const CENTRAL_LOCAL_OFFSET = 42;
const LOCAL_HEADER_SIZE = 30;
const LOCAL_NAME_LENGTH = 26;
const LOCAL_EXTRA_LENGTH = 28;
const STORED = 0;
const DEFLATED = 8;
const ZIP64_MARK = 0xff_ff_ff_ff;

function readAt(descriptor, position, length) {
  const buffer = Buffer.alloc(length);
  const read = readSync(descriptor, buffer, 0, length, position);
  return buffer.subarray(0, read);
}

function endRecord(descriptor, size) {
  const length = Math.min(size, END_RECORD_SIZE + MAX_COMMENT);
  const tail = readAt(descriptor, size - length, length);
  const at = tail.lastIndexOf(END_SIGNATURE);
  if (at < 0 || at + END_RECORD_SIZE > tail.length) {
    return undefined;
  }
  return {
    count: tail.readUInt16LE(at + END_ENTRY_COUNT),
    size: tail.readUInt32LE(at + END_DIRECTORY_SIZE),
    offset: tail.readUInt32LE(at + END_DIRECTORY_OFFSET),
  };
}

function centralEntry(directory, at) {
  if (
    at + CENTRAL_HEADER_SIZE > directory.length ||
    directory.readUInt32LE(at) !== CENTRAL_SIGNATURE
  ) {
    return undefined;
  }
  const nameLength = directory.readUInt16LE(at + CENTRAL_NAME_LENGTH);
  const nameStart = at + CENTRAL_HEADER_SIZE;
  return {
    name: directory.toString('utf8', nameStart, nameStart + nameLength),
    method: directory.readUInt16LE(at + CENTRAL_METHOD),
    compressedSize: directory.readUInt32LE(at + CENTRAL_COMPRESSED_SIZE),
    localOffset: directory.readUInt32LE(at + CENTRAL_LOCAL_OFFSET),
    next:
      nameStart +
      nameLength +
      directory.readUInt16LE(at + CENTRAL_EXTRA_LENGTH) +
      directory.readUInt16LE(at + CENTRAL_COMMENT_LENGTH),
  };
}

function centralEntries(directory, count) {
  const entries = [];
  const offsets = [0];
  for (const at of offsets) {
    const entry = entries.length < count ? centralEntry(directory, at) : undefined;
    if (entry !== undefined) {
      entries.push(entry);
      offsets.push(entry.next);
    }
  }
  return entries;
}

function entryText(descriptor, entry) {
  const header = readAt(descriptor, entry.localOffset, LOCAL_HEADER_SIZE);
  if (header.length < LOCAL_HEADER_SIZE || header.readUInt32LE(0) !== LOCAL_SIGNATURE) {
    return undefined;
  }
  const start =
    entry.localOffset +
    LOCAL_HEADER_SIZE +
    header.readUInt16LE(LOCAL_NAME_LENGTH) +
    header.readUInt16LE(LOCAL_EXTRA_LENGTH);
  const data = readAt(descriptor, start, entry.compressedSize);
  if (entry.method === STORED) {
    return data.toString('utf8');
  }
  return entry.method === DEFLATED ? inflateRawSync(data).toString('utf8') : undefined;
}

function readEntries(descriptor, names) {
  const end = endRecord(descriptor, fstatSync(descriptor).size);
  if (end === undefined || end.offset === ZIP64_MARK || end.size === ZIP64_MARK) {
    return [];
  }
  return centralEntries(readAt(descriptor, end.offset, end.size), end.count)
    .filter((entry) => names.includes(entry.name) && entry.compressedSize !== ZIP64_MARK)
    .map((entry) => ({ name: entry.name, text: entryText(descriptor, entry) }))
    .filter((entry) => entry.text !== undefined);
}

export function readJarEntries(file, names) {
  const descriptor = openSync(file, 'r');
  try {
    return readEntries(descriptor, names);
  } finally {
    closeSync(descriptor);
  }
}
