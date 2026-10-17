import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

export const CLASS_HEADER_BYTES = 8;
const UTF8 = 1;
const U4 = 4;
const CONTINUATION = { shift: 6, mask: 0x3f };
const TWO_BYTES = { shift: 5, lead: 0b110, mask: 0x1f };
const THREE_BYTES = { shift: 4, lead: 0b1110, mask: 0x0f };
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
    const value = (state.value << CONTINUATION.shift) | (byte & CONTINUATION.mask);
    return { ...state, value, left: state.left - 1 };
  }
  if (state.value !== undefined) {
    state.units.push(state.value);
  }
  if (byte >> TWO_BYTES.shift === TWO_BYTES.lead) {
    return { units: state.units, value: byte & TWO_BYTES.mask, left: 1 };
  }
  if (byte >> THREE_BYTES.shift === THREE_BYTES.lead) {
    return { units: state.units, value: byte & THREE_BYTES.mask, left: 2 };
  }
  return { units: state.units, value: byte, left: 0 };
}

function modifiedUtf8(bytes) {
  const state = [...bytes].reduce(decodeStep, { units: [], value: undefined, left: 0 });
  const units = state.value === undefined ? state.units : [...state.units, state.value];
  return String.fromCharCode(...units);
}

export function classReader(buffer) {
  const position = { offset: 0 };
  function take(bytes) {
    position.offset += bytes;
    return position.offset - bytes;
  }
  return {
    u1: () => buffer.readUInt8(take(1)),
    u2: () => buffer.readUInt16BE(take(2)),
    u4: () => buffer.readUInt32BE(take(U4)),
    skip: take,
    utf: () => {
      const length = buffer.readUInt16BE(take(2));
      const start = take(length);
      return modifiedUtf8(buffer.subarray(start, start + length));
    },
  };
}

function readConstant(reader, { constants, index }) {
  const tag = reader.u1();
  if (tag === UTF8) {
    constants.utf.set(index, reader.utf());
  } else if (tag === CLASS) {
    constants.classes.set(index, reader.u2());
  } else {
    reader.skip(CONSTANT_SIZES[tag]);
  }
  return WIDE_CONSTANTS.has(tag);
}

export function readConstantPool(reader) {
  const count = reader.u2();
  const constants = { utf: new Map(), classes: new Map() };
  const wideSlots = new Set();
  for (const index of Array.from({ length: count - 1 }, (_, slot) => slot + 1)) {
    if (!wideSlots.has(index) && readConstant(reader, { constants, index })) {
      wideSlots.add(index + 1);
    }
  }
  return {
    utf: constants.utf,
    className: (index) => constants.utf.get(constants.classes.get(index)),
    classNames: () =>
      [...constants.classes.values()].map((nameIndex) => constants.utf.get(nameIndex)),
  };
}

export function constantPoolStrings(buffer) {
  const reader = classReader(buffer);
  reader.skip(CLASS_HEADER_BYTES);
  return [...readConstantPool(reader).utf.values()];
}

export function classFiles(directory) {
  return existsSync(directory)
    ? readdirSync(directory, { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith('.class'))
        .map((entry) => path.join(entry.parentPath, entry.name))
        .sort()
    : [];
}
