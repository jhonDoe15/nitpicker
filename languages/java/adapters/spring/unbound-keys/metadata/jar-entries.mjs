import { closeSync, fstatSync, openSync, readSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';

const END_RECORD = 0x06_05_4b_50;
const CENTRAL_RECORD = 0x02_01_4b_50;
const LOCAL_RECORD = 0x04_03_4b_50;
const END_RECORD_SIZE = 22;
const MAX_COMMENT = 0xff_ff;
const CENTRAL_HEADER_SIZE = 46;
const LOCAL_HEADER_SIZE = 30;
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
  for (let at = tail.length - END_RECORD_SIZE; at >= 0; at -= 1) {
    if (tail.readUInt32LE(at) === END_RECORD) {
      return {
        count: tail.readUInt16LE(at + 10),
        size: tail.readUInt32LE(at + 12),
        offset: tail.readUInt32LE(at + 16),
      };
    }
  }
  return undefined;
}

function centralEntries(directory) {
  const entries = [];
  let at = 0;
  while (
    at + CENTRAL_HEADER_SIZE <= directory.length &&
    directory.readUInt32LE(at) === CENTRAL_RECORD
  ) {
    const nameLength = directory.readUInt16LE(at + 28);
    const skipped = directory.readUInt16LE(at + 30) + directory.readUInt16LE(at + 32);
    entries.push({
      name: directory.toString(
        'utf8',
        at + CENTRAL_HEADER_SIZE,
        at + CENTRAL_HEADER_SIZE + nameLength,
      ),
      method: directory.readUInt16LE(at + 10),
      compressedSize: directory.readUInt32LE(at + 20),
      localOffset: directory.readUInt32LE(at + 42),
    });
    at += CENTRAL_HEADER_SIZE + nameLength + skipped;
  }
  return entries;
}

function entryText(descriptor, entry) {
  const header = readAt(descriptor, entry.localOffset, LOCAL_HEADER_SIZE);
  if (header.length < LOCAL_HEADER_SIZE || header.readUInt32LE(0) !== LOCAL_RECORD) {
    return undefined;
  }
  const start =
    entry.localOffset + LOCAL_HEADER_SIZE + header.readUInt16LE(26) + header.readUInt16LE(28);
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
  return centralEntries(readAt(descriptor, end.offset, end.size))
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
