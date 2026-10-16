import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';

const CONSTANT_SIZES = new Map([
  [3, 4],
  [4, 4],
  [9, 4],
  [10, 4],
  [11, 4],
  [12, 4],
  [17, 4],
  [18, 4],
  [7, 2],
  [8, 2],
  [16, 2],
  [19, 2],
  [20, 2],
  [15, 3],
]);
const WIDE_CONSTANTS = new Set([5, 6]);
const UTF8 = 1;
const MAGIC = 0xca_fe_ba_be;
const HEADER_BYTES = 10;

function skipConstants(buffer, count) {
  const utf8 = new Map();
  let offset = HEADER_BYTES;
  for (let index = 1; index < count; index += 1) {
    const tag = buffer[offset];
    if (tag === UTF8) {
      const length = buffer.readUInt16BE(offset + 1);
      utf8.set(index, buffer.toString('utf8', offset + 3, offset + 3 + length));
      offset += 3 + length;
    } else if (WIDE_CONSTANTS.has(tag)) {
      offset += 9;
      index += 1;
    } else {
      offset += 1 + CONSTANT_SIZES.get(tag);
    }
  }
  return { utf8, offset };
}

function skipMembers(buffer, start) {
  let offset = start;
  const count = buffer.readUInt16BE(offset);
  offset += 2;
  for (let member = 0; member < count; member += 1) {
    offset = skipAttributes(buffer, offset + 6).offset;
  }
  return offset;
}

function skipAttributes(buffer, start, wanted = () => false) {
  let offset = start;
  const count = buffer.readUInt16BE(offset);
  offset += 2;
  const found = [];
  for (let attribute = 0; attribute < count; attribute += 1) {
    const length = buffer.readUInt32BE(offset + 2);
    if (wanted(buffer.readUInt16BE(offset))) {
      found.push(buffer.readUInt16BE(offset + 6));
    }
    offset += 6 + length;
  }
  return { offset, found };
}

export function sourceFileOf(buffer) {
  if (buffer.length < HEADER_BYTES || buffer.readUInt32BE(0) !== MAGIC) {
    return undefined;
  }
  const { utf8, offset } = skipConstants(buffer, buffer.readUInt16BE(8));
  const interfaces = buffer.readUInt16BE(offset + 6);
  const members = skipMembers(buffer, skipMembers(buffer, offset + 8 + 2 * interfaces));
  const { found } = skipAttributes(
    buffer,
    members,
    (nameIndex) => utf8.get(nameIndex) === 'SourceFile',
  );
  return found.length === 0 ? undefined : utf8.get(found[0]);
}

function classFilesIn(directory) {
  return readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.class'))
    .map((entry) => path.join(entry.parentPath, entry.name));
}

export function copyJavaClasses(classDirectory, target) {
  rmSync(target, { recursive: true, force: true });
  if (!existsSync(classDirectory)) {
    return [];
  }
  const copied = classFilesIn(classDirectory).filter(
    (file) => sourceFileOf(readFileSync(file))?.endsWith('.java') === true,
  );
  for (const file of copied) {
    const destination = path.join(target, path.relative(classDirectory, file));
    mkdirSync(path.dirname(destination), { recursive: true });
    copyFileSync(file, destination);
  }
  return copied;
}
