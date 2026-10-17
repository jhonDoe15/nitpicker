const EDGE_PUNCTUATION = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu;
const ID = '<id>';
const NUMBER = '<n>';
const GLUED_PLACEHOLDER = /[\p{L}\p{N}]<[a-z]+>|<[a-z]+>[\p{L}\p{N}]/u;
const PLAIN_TOKEN = /^[a-z0-9]{5,}$/u;
const CONSONANT_RUN = /[b-df-hj-np-tv-z]{4}/u;
const LETTER_AND_DIGIT = /^(?=.*\d)(?=.*[a-z])/u;
const VOWELS = /[aeiou]/gu;
const MAX_VOWEL_RATIO = 0.2;

function coreOf(token) {
  if (token.includes('`')) {
    return '';
  }
  if (token.includes(ID) || GLUED_PLACEHOLDER.test(token)) {
    return ID;
  }
  return token.includes(NUMBER) ? NUMBER : token.replaceAll(EDGE_PUNCTUATION, '');
}

function looksRandom(core) {
  const vowels = core.match(VOWELS)?.length ?? 0;
  return (
    CONSONANT_RUN.test(core) ||
    LETTER_AND_DIGIT.test(core) ||
    vowels / core.length < MAX_VOWEL_RATIO
  );
}

const PARTNERS = {
  identifier: ['identifier', 'random', 'plain', 'number'],
  random: ['identifier', 'random', 'plain'],
  plain: ['identifier', 'random'],
  number: ['identifier'],
};

export function opaqueClassOf(token) {
  const core = coreOf(token);
  if (core === ID || core === NUMBER) {
    return core === ID ? 'identifier' : 'number';
  }
  if (!PLAIN_TOKEN.test(core)) {
    return undefined;
  }
  return looksRandom(core) ? 'random' : 'plain';
}

export function opaquePartners(kind) {
  return PARTNERS[kind];
}

export function isOpaqueChange(left, right) {
  const kinds = [opaqueClassOf(left), opaqueClassOf(right)];
  return kinds.every((kind) => kind !== undefined) && opaquePartners(kinds[0]).includes(kinds[1]);
}
