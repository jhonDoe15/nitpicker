import { closeSync, fstatSync, openSync, readSync } from 'node:fs';
import {
  END_SIZE,
  LOCAL_FIELDS,
  MAX_COMMENT,
  MAX_TRAILING,
  ZIP64_LOCATOR,
  ZIP64_LOCATOR_SIZE,
  type ZipEntry,
  directoryStart,
  endOfDirectory,
  readEntry,
  readZip,
  zipEntryText,
} from './zip-entries.mts';

function bytesAt(handle: number, start: number, length: number): Buffer {
  const buffer = Buffer.alloc(length);
  const read = readSync(handle, buffer, 0, length, start);
  if (read !== length) {
    throw new Error(`zip archive ends before byte ${String(start + length)}`);
  }
  return buffer;
}

type Tail = { readonly bytes: Buffer; readonly start: number; readonly end: number };

function directoryBytes(
  handle: number,
  tail: Tail,
  directory: { start: number; prefix: number },
): Buffer {
  const first = directory.start + directory.prefix;
  return first >= tail.start
    ? tail.bytes.subarray(first - tail.start, tail.end)
    : bytesAt(handle, first, tail.start + tail.end - first);
}

function namedEntry(
  directory: Buffer,
  { count, prefix }: { count: number; prefix: number },
  name: string,
): ZipEntry | undefined {
  const offsets = count > 0 && directory.length > 0 ? [0] : [];
  for (const offset of offsets) {
    const { entry, next } = readEntry(directory, { offset, prefix });
    if (entry.name === name) {
      return entry;
    }
    if (offsets.length < count && next < directory.length) {
      offsets.push(next);
    }
  }
  return undefined;
}

function entryNamed(handle: number, size: number, name: string): ZipEntry | 'zip64' | undefined {
  const tailStart = Math.max(0, size - (END_SIZE + MAX_COMMENT + MAX_TRAILING));
  const bytes = bytesAt(handle, tailStart, size - tailStart);
  const end = endOfDirectory(bytes);
  const locator = end - ZIP64_LOCATOR_SIZE;
  if (locator >= 0 && bytes.readUInt32LE(locator) === ZIP64_LOCATOR) {
    return 'zip64';
  }
  const { start, count, prefix } = directoryStart(bytes);
  const filePrefix = prefix + tailStart;
  const directory = directoryBytes(
    handle,
    { bytes, start: tailStart, end },
    { start, prefix: filePrefix },
  );
  return namedEntry(directory, { count, prefix: filePrefix }, name);
}

function entryText(handle: number, entry: ZipEntry): string {
  const header = bytesAt(handle, entry.localOffset, LOCAL_FIELDS.name);
  const length =
    LOCAL_FIELDS.name +
    header.readUInt16LE(LOCAL_FIELDS.nameLength) +
    header.readUInt16LE(LOCAL_FIELDS.extraLength) +
    entry.compressedSize;
  return zipEntryText(bytesAt(handle, entry.localOffset, length), { ...entry, localOffset: 0 });
}

export function zipEntryOf(file: string, name: string): string | undefined {
  const handle = openSync(file, 'r');
  try {
    const found = entryNamed(handle, fstatSync(handle).size, name);
    if (found === 'zip64') {
      return readZip(file).text(name);
    }
    return found === undefined ? undefined : entryText(handle, found);
  } finally {
    closeSync(handle);
  }
}
