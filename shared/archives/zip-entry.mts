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

function entryNamed(handle: number, size: number, name: string): ZipEntry | 'zip64' | undefined {
  const tailStart = Math.max(0, size - (END_SIZE + MAX_COMMENT + MAX_TRAILING));
  const tail = bytesAt(handle, tailStart, size - tailStart);
  const end = endOfDirectory(tail);
  const locator = end - ZIP64_LOCATOR_SIZE;
  if (locator >= 0 && tail.readUInt32LE(locator) === ZIP64_LOCATOR) {
    return 'zip64';
  }
  const { start, count, prefix } = directoryStart(tail);
  const filePrefix = prefix + tailStart;
  const first = start + filePrefix;
  const length = tailStart + end - first;
  const directory =
    first >= tailStart ? tail.subarray(first - tailStart, end) : bytesAt(handle, first, length);
  let offset = 0;
  for (let index = 0; index < count && offset < directory.length; index += 1) {
    const { entry, next } = readEntry(directory, { offset, prefix: filePrefix });
    if (entry.name === name) {
      return entry;
    }
    offset = next;
  }
  return undefined;
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
