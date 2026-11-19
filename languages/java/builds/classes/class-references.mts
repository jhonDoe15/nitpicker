import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { readZipOrFailure } from '../zip-entries.mts';
import { classFiles, constantPoolStrings } from './class-file.mts';

const CLASS_NAME = /[A-Za-z_$][\w$]*(?:\/[\w$]+)+/gu;
const DESCRIPTOR_TYPE = 'L';
const CLASS_MAGIC = 0xcafebabe;
const MAGIC_BYTES = 4;
const PROCESSOR_SERVICE = 'META-INF/services/javax.annotation.processing.Processor';

function descriptorNames(text: string): string[] {
  return [...text.matchAll(CLASS_NAME)].flatMap(([token]) =>
    token.startsWith(DESCRIPTOR_TYPE) ? [token, token.slice(1)] : [token],
  );
}

function rawNames(bytes: Buffer): string[] {
  return [...bytes.toString('latin1').matchAll(CLASS_NAME)].flatMap(([token]) => [
    token,
    token.slice(1),
    token.slice(2),
  ]);
}

function constantPoolOrFailure(
  bytes: Buffer,
): { kind: 'class'; strings: string[] } | { kind: 'unreadable'; error: unknown } {
  try {
    return { kind: 'class', strings: constantPoolStrings(bytes) };
  } catch (error) {
    return { kind: 'unreadable', error };
  }
}

function classNames(file: string): string[] {
  const bytes = readFileSync(file);
  const isClassFile = bytes.length >= MAGIC_BYTES && bytes.readUInt32BE(0) === CLASS_MAGIC;
  const read = isClassFile ? constantPoolOrFailure(bytes) : { kind: 'not-a-class' as const };
  return read.kind === 'class' ? read.strings.flatMap(descriptorNames) : rawNames(bytes);
}

export function referencedNames(classDirectories: readonly string[]): Set<string> {
  const files = classDirectories.flatMap((directory) => classFiles(directory));
  return new Set(files.flatMap(classNames).map((name) => `${name}.class`));
}

function archiveEntries(archive: string): string[] | undefined {
  if (statSync(archive).isDirectory()) {
    return classFiles(archive).map((file) =>
      path.relative(archive, file).split(path.sep).join('/'),
    );
  }
  const read = readZipOrFailure(archive);
  return read.kind === 'zip' ? [...read.zip.names] : undefined;
}

export function usesArchive(archive: string, names: ReadonlySet<string>): boolean {
  const entries = archiveEntries(archive);
  return (
    entries === undefined ||
    entries.some((entry) => names.has(entry) || entry === PROCESSOR_SERVICE)
  );
}
