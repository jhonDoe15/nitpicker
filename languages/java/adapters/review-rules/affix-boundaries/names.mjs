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

function hasLastWord(name, words) {
  const parts = name === undefined ? [] : wordsOf(name);
  const last = parts.at(-1);
  return words.has(last) || (last === 'name' && parts.at(-2) === 'package');
}

export const isDirectoryName = (name) => hasLastWord(name, DIRECTORY_WORDS);
export const isHostName = (name) => hasLastWord(name, HOST_WORDS);
export const isLocationName = (name) => hasLastWord(name, LOCATION_WORDS);
export const isPrefixName = (name) => name?.toLowerCase() === 'prefix';
export const isSeparatorName = (name) =>
  name !== undefined && wordsOf(name).some((word) => SEPARATOR_WORDS.has(word));
export const isStringCall = (name) => STRING_CALLS.has(name);
