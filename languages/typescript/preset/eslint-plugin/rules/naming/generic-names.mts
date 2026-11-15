import {
  ACCEPTED_MANAGER_ROLES,
  CONTAINER_NAME_WORDS,
  GENERIC_NAME_WORDS,
} from '../../../../../../shared/naming/smell-words.mjs';

function inSet(set: ReadonlySet<string>, word: string | undefined): boolean {
  return word !== undefined && set.has(word);
}

const GENERIC_WORDS = new Set(GENERIC_NAME_WORDS);
const CONTAINER_WORDS = new Set(CONTAINER_NAME_WORDS);
const MANAGER_ROLES = new Set(ACCEPTED_MANAGER_ROLES);
const MANAGER_WORDS = new Set(['manager', 'managers']);
const WORD_BOUNDARIES = [/([a-z0-9])([A-Z])/g, /([A-Z]+)([A-Z][a-z])/g];
const VERSION_WORD = /^v?$/;
const IMPLEMENTATION_WORDS = new Set(['impl']);
const SECOND_TO_LAST = -2;

function nameWords(name: string): string[] {
  const spaced = WORD_BOUNDARIES.reduce((text, boundary) => text.replace(boundary, '$1 $2'), name);
  return spaced
    .split(/[^A-Za-z0-9]+/)
    .map((word) => word.toLowerCase().replace(/\d+$/, ''))
    .filter((word) => word !== '' && !VERSION_WORD.test(word));
}

function judgedWords(name: string): string[] {
  const words = nameWords(name);
  const last = words.at(-1);
  const wrapper = inSet(CONTAINER_WORDS, last) || inSet(IMPLEMENTATION_WORDS, last);
  return words.length > 1 && wrapper ? words.slice(0, -1) : words;
}

export function isGenericName(name: string): boolean {
  const words = judgedWords(name);
  const last = words.at(-1);
  const managerRole = inSet(MANAGER_WORDS, last) && inSet(MANAGER_ROLES, words.at(SECOND_TO_LAST));
  return inSet(GENERIC_WORDS, last) && !managerRole;
}

export function lastWord(name: string): string | undefined {
  return judgedWords(name).at(-1);
}
