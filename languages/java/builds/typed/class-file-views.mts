import {
  CLASS_HEADER_BYTES,
  classFiles,
  classReader,
  readConstantPool,
} from '../classes/class-file.mjs';

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

export const classHeaderBytes: number = CLASS_HEADER_BYTES;
export const classFilesIn: (directory: string) => string[] = classFiles;
export const readerOf: (buffer: Buffer) => ClassReader = classReader;
export const constantPoolOf: (reader: ClassReader) => ConstantPool = readConstantPool;
