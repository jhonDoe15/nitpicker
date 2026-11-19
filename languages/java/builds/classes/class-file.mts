import { existsSync, readdirSync, type Dirent } from 'node:fs';
import path from 'node:path';

export type ClassReader = {
  u1(): number;
  u2(): number;
  u4(): number;
  skip(bytes: number): number;
  utf(): string;
};
export type ConstantPool = {
  readonly utf: ReadonlyMap<number, string>;
  className(index: number): string;
  classNames(): string[];
  memberOwners(): string[];
};
type DecodeState = {
  readonly units: number[];
  readonly value: number | undefined;
  readonly left: number;
};
type PoolParts = {
  readonly utf: Map<number, string>;
  readonly classes: Map<number, number>;
  readonly owners: Set<number>;
};

export const CLASS_HEADER_BYTES = 8;
const UTF8 = 1;
const U4 = 4;
const CONTINUATION = { shift: 6, mask: 0x3f };
const TWO_BYTES = { shift: 5, lead: 0b110, mask: 0x1f };
const THREE_BYTES = { shift: 4, lead: 0b1110, mask: 0x0f };
const CLASS = 7;
const MEMBER_REFERENCES = new Set([9, 10, 11]);
const NAME_AND_TYPE_BYTES = 2;
const WIDE_CONSTANTS = new Set([5, 6]);
const CONSTANT_SIZES: Readonly<Record<number, number>> = {
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

function decodeStep(state: DecodeState, byte: number): DecodeState {
  if (state.left > 0) {
    const value = ((state.value ?? 0) << CONTINUATION.shift) | (byte & CONTINUATION.mask);
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

function modifiedUtf8(bytes: Uint8Array): string {
  const initial: DecodeState = { units: [], value: undefined, left: 0 };
  const state = [...bytes].reduce(decodeStep, initial);
  const units = state.value === undefined ? state.units : [...state.units, state.value];
  return units.map((unit) => String.fromCharCode(unit)).join('');
}

export function classReader(buffer: Buffer): ClassReader {
  const position = { offset: 0 };
  function take(bytes: number): number {
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

function readConstant(
  reader: ClassReader,
  { pool, index }: { pool: PoolParts; index: number },
): boolean {
  const tag = reader.u1();
  if (tag === UTF8) {
    pool.utf.set(index, reader.utf());
  } else if (tag === CLASS) {
    pool.classes.set(index, reader.u2());
  } else if (MEMBER_REFERENCES.has(tag)) {
    pool.owners.add(reader.u2());
    reader.skip(NAME_AND_TYPE_BYTES);
  } else {
    reader.skip(CONSTANT_SIZES[tag] ?? Number.NaN);
  }
  return WIDE_CONSTANTS.has(tag);
}

function nameAt(pool: PoolParts, index: number | undefined): string | undefined {
  return index === undefined ? undefined : pool.utf.get(index);
}

export function readConstantPool(reader: ClassReader): ConstantPool {
  const count = reader.u2();
  const pool: PoolParts = { utf: new Map(), classes: new Map(), owners: new Set() };
  const wideSlots = new Set<number>();
  for (const index of Array.from({ length: count - 1 }, (_, slot) => slot + 1)) {
    if (!wideSlots.has(index) && readConstant(reader, { pool, index })) {
      wideSlots.add(index + 1);
    }
  }
  return {
    utf: pool.utf,
    className: (index) => nameAt(pool, pool.classes.get(index)) ?? '',
    classNames: () => [...pool.classes.values()].map((nameIndex) => nameAt(pool, nameIndex) ?? ''),
    memberOwners: () =>
      [...pool.owners]
        .map((index) => nameAt(pool, pool.classes.get(index)))
        .filter((name) => name !== undefined),
  };
}

export function constantPoolStrings(buffer: Buffer): string[] {
  const reader = classReader(buffer);
  reader.skip(CLASS_HEADER_BYTES);
  return [...readConstantPool(reader).utf.values()];
}

export function classEntries(directory: string): Dirent[] {
  return existsSync(directory)
    ? readdirSync(directory, { recursive: true, withFileTypes: true }).filter(
        (entry) => entry.isFile() && entry.name.endsWith('.class'),
      )
    : [];
}

export function classFiles(directory: string): string[] {
  return classEntries(directory)
    .map((entry) => path.join(entry.parentPath, entry.name))
    .sort();
}
