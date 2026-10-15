import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const UTF8 = 1;
const CLASS = 7;
const LONG = 5;
const DOUBLE = 6;
const CONSTANT_SIZES = {
  3: 4,
  4: 4,
  5: 8,
  6: 8,
  8: 2,
  9: 4,
  10: 4,
  11: 4,
  12: 4,
  15: 3,
  16: 2,
  17: 4,
  18: 4,
  19: 2,
  20: 2,
};

function classReader(buffer) {
  let offset = 0;
  const u1 = () => buffer.readUInt8((offset += 1) - 1);
  const u2 = () => buffer.readUInt16BE((offset += 2) - 2);
  const u4 = () => buffer.readUInt32BE((offset += 4) - 4);
  const skip = (bytes) => {
    offset += bytes;
  };
  const utf = () => {
    const length = u2();
    skip(length);
    return buffer.toString('utf8', offset - length, offset);
  };
  return { u1, u2, u4, skip, utf };
}

function readConstantPool(reader) {
  const count = reader.u2();
  const utf = new Map();
  const classes = new Map();
  for (let index = 1; index < count; index += 1) {
    const tag = reader.u1();
    if (tag === UTF8) {
      utf.set(index, reader.utf());
    } else if (tag === CLASS) {
      classes.set(index, reader.u2());
    } else {
      reader.skip(CONSTANT_SIZES[tag]);
    }
    if (tag === LONG || tag === DOUBLE) {
      index += 1;
    }
  }
  return { utf, className: (index) => utf.get(classes.get(index)) };
}

function skipMembers(reader) {
  const members = reader.u2();
  for (let member = 0; member < members; member += 1) {
    reader.skip(6);
    const attributes = reader.u2();
    for (let attribute = 0; attribute < attributes; attribute += 1) {
      reader.skip(2);
      reader.skip(reader.u4());
    }
  }
}

export function permittedSubclasses(buffer) {
  const reader = classReader(buffer);
  reader.skip(8);
  const pool = readConstantPool(reader);
  reader.skip(2);
  const self = pool.className(reader.u2());
  reader.skip(2);
  reader.skip(2 * reader.u2());
  skipMembers(reader);
  skipMembers(reader);
  const permitted = [];
  const attributes = reader.u2();
  for (let attribute = 0; attribute < attributes; attribute += 1) {
    const name = pool.utf.get(reader.u2());
    const length = reader.u4();
    if (name === 'PermittedSubclasses') {
      const count = reader.u2();
      for (let index = 0; index < count; index += 1) {
        permitted.push(pool.className(reader.u2()));
      }
    } else {
      reader.skip(length);
    }
  }
  return permitted.map(
    (subclass) => `${self.replaceAll('/', '.')} -> ${subclass.replaceAll('/', '.')}`,
  );
}

function classFiles(directory) {
  return existsSync(directory)
    ? readdirSync(directory, { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith('.class'))
        .map((entry) => path.join(entry.parentPath, entry.name))
        .sort()
    : [];
}

export function runPermits({ module, reportDir }) {
  const lines = classFiles(module.outputDirectory).flatMap((file) =>
    permittedSubclasses(readFileSync(file)),
  );
  writeFileSync(
    path.join(reportDir, 'permits.txt'),
    lines.map((line) => `${line}\n`).join(''),
  );
}
