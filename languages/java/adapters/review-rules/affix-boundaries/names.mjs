import { wordsOf } from '../../../../../shared/naming/name-words.mjs';

export { wordsOf };
const DIRECTORY_WORDS = new Set([
  'path',
  'pathname',
  'dir',
  'dirname',
  'directory',
  'folder',
  'root',
  'base',
  'route',
  'pkg',
  'home',
  'homedir',
]);
const HOST_WORDS = new Set(['domain', 'host', 'hostname', 'origin']);
const LOCATION_WORDS = new Set([...DIRECTORY_WORDS, ...HOST_WORDS, 'url', 'uri', 'filename']);
const SEPARATOR_WORDS = new Set(['sep', 'separator', 'slash', 'delimiter']);
const STRING_CALLS = new Set([
  'toString',
  'getPath',
  'getRequestURI',
  'getServletPath',
  'getPathInfo',
  'getContextPath',
  'getHost',
  'getCanonicalPath',
  'getAbsolutePath',
  'getPackageName',
  'getRequestURL',
]);

const SECOND_TO_LAST = -2;

function hasLastWord(name, words) {
  const parts = name === undefined ? [] : wordsOf(name);
  const last = parts.at(-1);
  return words.has(last) || (last === 'name' && parts.at(SECOND_TO_LAST) === 'package');
}

export function isDirectoryName(name) {
  return hasLastWord(name, DIRECTORY_WORDS);
}

export function isHostName(name) {
  return hasLastWord(name, HOST_WORDS);
}

export function isLocationName(name) {
  return hasLastWord(name, LOCATION_WORDS);
}

export function isPrefixName(name) {
  return name?.toLowerCase() === 'prefix';
}

export function isSeparatorName(name) {
  return name !== undefined && wordsOf(name).some((word) => SEPARATOR_WORDS.has(word));
}

export function isStringCall(name) {
  return STRING_CALLS.has(name);
}
