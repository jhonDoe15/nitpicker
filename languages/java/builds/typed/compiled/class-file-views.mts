import {
  CLASS_HEADER_BYTES,
  classFiles,
  classReader,
  readConstantPool,
} from '../../classes/class-file.mts';
import type { ClassReader, ConstantPool } from '../../classes/class-file.mts';

export type { ClassReader, ConstantPool };

export const classHeaderBytes: number = CLASS_HEADER_BYTES;
export const classFilesIn: (directory: string) => string[] = classFiles;
export const readerOf: (buffer: Buffer) => ClassReader = classReader;
export const constantPoolOf: (reader: ClassReader) => ConstantPool = readConstantPool;
