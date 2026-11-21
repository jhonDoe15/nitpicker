import path from 'node:path';
import { stripVTControlCharacters } from 'node:util';
import { fieldOf } from '../../values/readers.mts';

const FORCE_COLOR_OFF = new Set(['0', 'false']);

export function withoutAnsi(text: string): string;
export function withoutAnsi(text: string | undefined): string | undefined;
export function withoutAnsi(text: string | undefined): string | undefined {
  return typeof text === 'string' ? stripVTControlCharacters(text) : text;
}

export function colorEnabled(
  stream: unknown,
  environment: Readonly<Record<string, string | undefined>>,
): boolean {
  if (environment['NO_COLOR'] !== undefined) {
    return false;
  }
  if (environment['FORCE_COLOR'] !== undefined) {
    return !FORCE_COLOR_OFF.has(environment['FORCE_COLOR'].toLowerCase());
  }
  return fieldOf(stream, 'isTTY') === true && environment['TERM'] !== 'dumb';
}

export function displayPath(absolutePath: string, currentDirectory = process.cwd()): string {
  const relative = path.relative(currentDirectory, absolutePath);
  if (relative === '') {
    return '.';
  }
  const outside =
    relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative);
  return outside ? absolutePath : relative;
}
