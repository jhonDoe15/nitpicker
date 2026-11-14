import { readFileSync } from 'node:fs';
import {
  classFilesIn,
  classHeaderBytes,
  constantPoolOf,
  readerOf,
  type ClassReader,
  type ConstantPool,
} from '../typed/class-file-views.mts';

export type ClassSummary = {
  readonly name: string;
  readonly superName: string | undefined;
  readonly interfaces: string[];
  readonly sourceFile: string | undefined;
  readonly permitted: string[];
  readonly references: Set<string>;
  readonly usedMembers: Set<string>;
};
type Attributes = { readonly sourceFile: string | undefined; readonly permitted: string[] };
type ClassRead =
  | { readonly kind: 'class'; readonly summary: ClassSummary }
  | { readonly kind: 'unreadable'; readonly error: unknown };

const DESCRIPTOR_NAME = /L([\w$]+(?:\/[\w$]+)*);/gu;
const NO_SUPERCLASS = 0;
const MEMBER_HEADER_BYTES = 6;

function skipAttribute(reader: ClassReader): ClassReader {
  reader.skip(2);
  reader.skip(reader.u4());
  return reader;
}

function skipMember(reader: ClassReader): ClassReader {
  reader.skip(MEMBER_HEADER_BYTES);
  Array.from({ length: reader.u2() }).reduce(skipAttribute, reader);
  return reader;
}

function skipMembers(reader: ClassReader): void {
  Array.from({ length: reader.u2() }).reduce(skipMember, reader);
}

function readAttribute(
  { reader, pool }: { readonly reader: ClassReader; readonly pool: ConstantPool },
  found: Attributes,
): Attributes {
  const name = pool.utf.get(reader.u2());
  const length = reader.u4();
  if (name === 'SourceFile') {
    return { ...found, sourceFile: pool.utf.get(reader.u2()) };
  }
  if (name === 'PermittedSubclasses') {
    return {
      ...found,
      permitted: Array.from({ length: reader.u2() }, () => pool.className(reader.u2())),
    };
  }
  reader.skip(length);
  return found;
}

function readAttributes(reader: ClassReader, pool: ConstantPool): Attributes {
  return Array.from({ length: reader.u2() }).reduce(
    (found: Attributes) => readAttribute({ reader, pool }, found),
    { sourceFile: undefined, permitted: [] },
  );
}

function descriptorNamesOf(pool: ConstantPool): string[] {
  return [...pool.utf.values()].flatMap((text) =>
    [...text.matchAll(DESCRIPTOR_NAME)].map(([, name = '']) => name),
  );
}

function referencesOf(pool: ConstantPool): Set<string> {
  return new Set([...pool.classNames(), ...descriptorNamesOf(pool)]);
}

export function classSummary(buffer: Buffer): ClassSummary {
  const reader = readerOf(buffer);
  reader.skip(classHeaderBytes);
  const pool = constantPoolOf(reader);
  reader.skip(2);
  const name = pool.className(reader.u2());
  const superIndex = reader.u2();
  const interfaces = Array.from({ length: reader.u2() }, () => pool.className(reader.u2()));
  skipMembers(reader);
  skipMembers(reader);
  return {
    name,
    superName: superIndex === NO_SUPERCLASS ? undefined : pool.className(superIndex),
    interfaces,
    ...readAttributes(reader, pool),
    references: referencesOf(pool),
    usedMembers: new Set([...pool.memberOwners(), ...descriptorNamesOf(pool)]),
  };
}

function summaryOrFailure(file: string): ClassRead {
  try {
    return { kind: 'class', summary: classSummary(readFileSync(file)) };
  } catch (error) {
    return { kind: 'unreadable', error };
  }
}

export function classSummaries(directories: readonly string[]): ClassSummary[] {
  return directories
    .flatMap((directory) => classFilesIn(directory))
    .map((file) => summaryOrFailure(file))
    .filter((read) => read.kind === 'class')
    .map((read) => read.summary);
}
