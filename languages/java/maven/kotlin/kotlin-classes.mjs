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
const CONSTANT_COUNT_OFFSET = 8;
const UTF8_HEADER_BYTES = 3;
const WIDE_CONSTANT_BYTES = 9;
const MEMBER_HEADER_BYTES = 6;
const ATTRIBUTE_HEADER_BYTES = 6;
const INTERFACES_OFFSET = 6;
const CLASS_PREAMBLE_BYTES = 8;

function readConstant(buffer, offset) {
  const tag = buffer[offset];
  if (tag === UTF8) {
    const start = offset + UTF8_HEADER_BYTES;
    const end = start + buffer.readUInt16BE(offset + 1);
    return { next: end, slots: 1, text: buffer.toString('utf8', start, end) };
  }
  if (WIDE_CONSTANTS.has(tag)) {
    return { next: offset + WIDE_CONSTANT_BYTES, slots: 2 };
  }
  if (CONSTANT_SIZES.has(tag)) {
    return { next: offset + 1 + CONSTANT_SIZES.get(tag), slots: 1 };
  }
  throw new RangeError(`unknown constant pool tag ${String(tag)}`);
}

function skipConstants(buffer, count) {
  const texts = [];
  let offset = HEADER_BYTES;
  const pending = [1];
  for (const index of pending) {
    if (index < count) {
      const constant = readConstant(buffer, offset);
      texts.push([index, constant.text]);
      offset = constant.next;
      pending.push(index + constant.slots);
    }
  }
  return { utf8: new Map(texts.filter(([, text]) => text !== undefined)), offset };
}

function skipAttributes(buffer, start, wanted = () => false) {
  const found = [];
  const offset = Array.from({ length: buffer.readUInt16BE(start) }).reduce((at) => {
    if (wanted(buffer.readUInt16BE(at))) {
      found.push(buffer.readUInt16BE(at + ATTRIBUTE_HEADER_BYTES));
    }
    return at + ATTRIBUTE_HEADER_BYTES + buffer.readUInt32BE(at + 2);
  }, start + 2);
  return { offset, found };
}

function skipMembers(buffer, start) {
  return Array.from({ length: buffer.readUInt16BE(start) }).reduce(
    (offset) => skipAttributes(buffer, offset + MEMBER_HEADER_BYTES).offset,
    start + 2,
  );
}

export function sourceFileOf(buffer) {
  if (buffer.length < HEADER_BYTES || buffer.readUInt32BE(0) !== MAGIC) {
    return undefined;
  }
  const { utf8, offset } = skipConstants(buffer, buffer.readUInt16BE(CONSTANT_COUNT_OFFSET));
  const interfaces = buffer.readUInt16BE(offset + INTERFACES_OFFSET);
  const members = skipMembers(
    buffer,
    skipMembers(buffer, offset + CLASS_PREAMBLE_BYTES + 2 * interfaces),
  );
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

function isJavaClass(file) {
  try {
    const sourceFile = sourceFileOf(readFileSync(file));
    return sourceFile === undefined || sourceFile.endsWith('.java');
  } catch (error) {
    throw new Error(`nitpicker cannot read the class file ${file}: ${error.message}`, {
      cause: error,
    });
  }
}

function destinationOf(classDirectory, target, file) {
  const base = path.resolve(target);
  const destination = path.resolve(base, path.relative(classDirectory, file));
  if (!destination.startsWith(base + path.sep)) {
    throw new Error(`nitpicker will not copy the class file ${file} outside ${target}`);
  }
  return destination;
}

export function copyJavaClasses(classDirectory, target) {
  rmSync(target, { recursive: true, force: true });
  if (!existsSync(classDirectory)) {
    return [];
  }
  const copied = classFilesIn(classDirectory).filter(isJavaClass);
  for (const file of copied) {
    const destination = destinationOf(classDirectory, target, file);
    mkdirSync(path.dirname(destination), { recursive: true });
    copyFileSync(file, destination);
  }
  return copied;
}
