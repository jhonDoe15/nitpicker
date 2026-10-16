import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { classFiles, classReader, readConstantPool } from '../../builds/classes/class-file.mjs';

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

function readPermitted(reader, constants) {
  return Array.from({ length: reader.u2() }).flatMap(() => {
    const name = constants.utf.get(reader.u2());
    const length = reader.u4();
    if (name !== 'PermittedSubclasses') {
      reader.skip(length);
      return [];
    }
    return Array.from({ length: reader.u2() }, () => constants.className(reader.u2()));
  });
}

export function permittedSubclasses(buffer) {
  const reader = classReader(buffer);
  reader.skip(8);
  const constants = readConstantPool(reader);
  reader.skip(2);
  const self = constants.className(reader.u2());
  reader.skip(2);
  reader.skip(2 * reader.u2());
  skipMembers(reader);
  skipMembers(reader);
  return readPermitted(reader, constants).map(
    (subclass) => `${self.replaceAll('/', '.')} -> ${subclass.replaceAll('/', '.')}`,
  );
}

function permitsOrFailure(buffer) {
  try {
    return { kind: 'class', permits: permittedSubclasses(buffer) };
  } catch (error) {
    return { kind: 'unreadable', error };
  }
}

function readablePermits(buffer) {
  const read = permitsOrFailure(buffer);
  return read.kind === 'class' ? read.permits : [];
}

export function runPermits({ module, reportDir }) {
  const lines = classFiles(module.outputDirectory).flatMap((file) =>
    readablePermits(readFileSync(file)),
  );
  writeFileSync(path.join(reportDir, 'permits.txt'), lines.map((line) => `${line}\n`).join(''));
}
