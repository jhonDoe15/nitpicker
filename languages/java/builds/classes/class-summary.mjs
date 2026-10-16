import { readFileSync } from 'node:fs';
import { CLASS_HEADER_BYTES, classFiles, classReader, readConstantPool } from './class-file.mjs';

const DESCRIPTOR_NAME = /L([\w$]+(?:\/[\w$]+)*);/gu;
const NO_SUPERCLASS = 0;
const MEMBER_HEADER_BYTES = 6;

function skipAttribute(reader) {
  reader.skip(2);
  reader.skip(reader.u4());
  return reader;
}

function skipMember(reader) {
  reader.skip(MEMBER_HEADER_BYTES);
  Array.from({ length: reader.u2() }).reduce(skipAttribute, reader);
  return reader;
}

function skipMembers(reader) {
  Array.from({ length: reader.u2() }).reduce(skipMember, reader);
}

function readAttribute({ reader, pool }, found) {
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

function readAttributes(reader, pool) {
  return Array.from({ length: reader.u2() }).reduce(
    (found) => readAttribute({ reader, pool }, found),
    { sourceFile: undefined, permitted: [] },
  );
}

function referencesOf(pool) {
  const names = [...pool.utf.values()].flatMap((text) =>
    [...text.matchAll(DESCRIPTOR_NAME)].map(([, name]) => name),
  );
  return new Set([...pool.classNames(), ...names]);
}

export function classSummary(buffer) {
  const reader = classReader(buffer);
  reader.skip(CLASS_HEADER_BYTES);
  const pool = readConstantPool(reader);
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
  };
}

function summaryOrFailure(file) {
  try {
    return { kind: 'class', summary: classSummary(readFileSync(file)) };
  } catch (error) {
    return { kind: 'unreadable', error };
  }
}

export function classSummaries(directories) {
  return directories
    .flatMap((directory) => classFiles(directory))
    .map((file) => summaryOrFailure(file))
    .filter((read) => read.kind === 'class')
    .map((read) => read.summary);
}
