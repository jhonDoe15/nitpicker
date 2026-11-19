export type Reading = {
  file: string;
  notes: readonly string[];
  note: (message: string) => void;
  resolve: (argument: string) => string | undefined;
};

export function createReading(
  file: string,
  resolve: (argument: string) => string | undefined,
): Reading {
  const notes: string[] = [];
  return {
    file,
    notes,
    note: (message: string) => {
      notes.push(message);
    },
    resolve,
  };
}

import type { Optional } from '../../typed/optional.mts';
import { FORMATTER_VERSION } from '../java-formatter-options.mts';

export function unquoted(argument: string): string {
  return argument
    .trim()
    .replaceAll(/^["']|["']$/gu, '')
    .toLowerCase();
}

export function flagValue(argument: string, name: string, reading: Reading): Optional<boolean> {
  const trimmed = argument.trim();
  const direct = trimmed === '' ? 'true' : unquoted(reading.resolve(trimmed) ?? trimmed);
  if (direct === 'true' || direct === 'false') {
    return direct === 'true';
  }
  reading.note(`Could not read ${name}(${trimmed}) in ${reading.file}; using the Spotless default`);
  return undefined;
}

export function versionValue(argument: string, reading: Reading): string | undefined {
  const trimmed = argument.trim();
  if (trimmed === '') {
    return undefined;
  }
  const value = reading.resolve(trimmed);
  if (value !== undefined && FORMATTER_VERSION.test(value)) {
    return value;
  }
  reading.note(
    `Could not read the Java formatter version (${trimmed}) in ${reading.file}; using the version nitpicker pins`,
  );
  return undefined;
}
