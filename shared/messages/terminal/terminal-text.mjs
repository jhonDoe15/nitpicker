import path from 'node:path';
import { stripVTControlCharacters } from 'node:util';

const FORCE_COLOR_OFF = new Set(['0', 'false']);

export function withoutAnsi(text) {
  return typeof text === 'string' ? stripVTControlCharacters(text) : text;
}

export function colorEnabled(stream, environment) {
  if (environment.NO_COLOR !== undefined) {
    return false;
  }
  if (environment.FORCE_COLOR !== undefined) {
    return !FORCE_COLOR_OFF.has(environment.FORCE_COLOR.toLowerCase());
  }
  return stream?.isTTY === true && environment.TERM !== 'dumb';
}

export function displayPath(absolutePath, currentDirectory = process.cwd()) {
  const relative = path.relative(currentDirectory, absolutePath);
  if (relative === '') {
    return '.';
  }
  const outside =
    relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative);
  return outside ? absolutePath : relative;
}
