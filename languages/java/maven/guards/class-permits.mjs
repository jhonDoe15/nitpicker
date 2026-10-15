import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const UTF8 = 1;
const CLASS = 7;
const WIDE_CONSTANTS = new Set([5, 6]);
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

function decodeStep(state, byte) {
  if (state.left > 0) {
    return { ...state, value: (state.value << 6) | (byte & 0x3f), left: state.left - 1 };
  }
  if (state.value !== undefined) {
    state.units.push(state.value);
  }
  if (byte >> 5 === 0b110) {
    return { units: state.units, value: byte & 0x1f, left: 1 };
  }
  if (byte >> 4 === 0b1110) {
    return { units: state.units, value: byte & 0x0f, left: 2 };
  }
  return { units: state.units, value: byte, left: 0 };
}

function modifiedUtf8(bytes) {
  const state = [...bytes].reduce(decodeStep, { units: [], value: undefined, left: 0 });
  const units = state.value === undefined ? state.units : [...state.units, state.value];
  return String.fromCharCode(...units);
}

function classReader(buffer) {
  const position = { offset: 0 };
  function take(bytes) {
    position.offset += bytes;
    return position.offset - bytes;
  }
  return {
    u1: () => buffer.readUInt8(take(1)),
    u2: () => buffer.readUInt16BE(take(2)),
    u4: () => buffer.readUInt32BE(take(4)),
    skip: take,
    utf: () => {
      const length = buffer.readUInt16BE(take(2));
      const start = take(length);
      return modifiedUtf8(buffer.subarray(start, start + length));
    },
  };
}

function readConstant(reader, { pool, index }) {
  const tag = reader.u1();
  if (tag === UTF8) {
    pool.utf.set(index, reader.utf());
  } else if (tag === CLASS) {
    pool.classes.set(index, reader.u2());
  } else {
    reader.skip(CONSTANT_SIZES[tag]);
  }
  return WIDE_CONSTANTS.has(tag);
}

function readConstantPool(reader) {
  const count = reader.u2();
  const pool = { utf: new Map(), classes: new Map() };
  const wideSlots = new Set();
  for (const index of Array.from({ length: count - 1 }, (_, slot) => slot + 1)) {
    if (!wideSlots.has(index) && readConstant(reader, { pool, index })) {
      wideSlots.add(index + 1);
    }
  }
  return { utf: pool.utf, className: (index) => pool.utf.get(pool.classes.get(index)) };
}

function skipAttribute(reader) {
  reader.skip(2);
  reader.skip(reader.u4());
  return reader;
}

function skipAttributes(reader) {
  Array.from({ length: reader.u2() }).reduce(skipAttribute, reader);
  return reader;
}

function skipMember(reader) {
  reader.skip(6);
  return skipAttributes(reader);
}

function skipMembers(reader) {
  Array.from({ length: reader.u2() }).reduce(skipMember, reader);
}

function readPermitted(reader, pool) {
  return Array.from({ length: reader.u2() }).flatMap(() => {
    const name = pool.utf.get(reader.u2());
    const length = reader.u4();
    if (name !== 'PermittedSubclasses') {
      reader.skip(length);
      return [];
    }
    return Array.from({ length: reader.u2() }, () => pool.className(reader.u2()));
  });
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
  return readPermitted(reader, pool).map(
    (subclass) => `${self.replaceAll('/', '.')} -> ${subclass.replaceAll('/', '.')}`,
  );
}

export function classFiles(directory) {
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
  writeFileSync(path.join(reportDir, 'permits.txt'), lines.map((line) => `${line}\n`).join(''));
}
