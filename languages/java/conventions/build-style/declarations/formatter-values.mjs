import { FORMATTER_VERSION } from '../java-formatter-options.mjs';

export function unquoted(argument) {
  return argument
    .trim()
    .replaceAll(/^["']|["']$/gu, '')
    .toLowerCase();
}

export function flagValue(argument, name, reading) {
  const trimmed = argument.trim();
  const direct = trimmed === '' ? 'true' : unquoted(reading.resolve(trimmed) ?? trimmed);
  if (direct === 'true' || direct === 'false') {
    return direct === 'true';
  }
  reading.notes.push(
    `Could not read ${name}(${trimmed}) in ${reading.file}; using the Spotless default`,
  );
  return undefined;
}

export function versionValue(argument, reading) {
  const trimmed = argument.trim();
  if (trimmed === '') {
    return undefined;
  }
  const value = reading.resolve(trimmed);
  if (value !== undefined && FORMATTER_VERSION.test(value)) {
    return value;
  }
  reading.notes.push(
    `Could not read the Java formatter version (${trimmed}) in ${reading.file}; using the version nitpicker pins`,
  );
  return undefined;
}
