const EDGE_PUNCTUATION = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu;
const ID = '<id>';
const NUMBER = '<n>';
const GLUED_PLACEHOLDER = /[\p{L}\p{N}]<[a-z]+>|<[a-z]+>[\p{L}\p{N}]/u;
const PLAIN_TOKEN = /^[a-z0-9]{5,}$/u;
const CONSONANT_RUN = /[b-df-hj-np-tv-z]{4}/u;
const LETTER_AND_DIGIT = /^(?=.*\d)(?=.*[a-z])/u;
const VOWELS = /[aeiou]/gu;
const MAX_VOWEL_RATIO = 0.2;

export type OpaqueClass = 'identifier' | 'random' | 'plain' | 'number';

function coreOf(token: string): string {
  if (token.includes('`')) {
    return '';
  }
  if (token.includes(ID) || GLUED_PLACEHOLDER.test(token)) {
    return ID;
  }
  return token.includes(NUMBER) ? NUMBER : token.replaceAll(EDGE_PUNCTUATION, '');
}

function looksRandom(core: string): boolean {
  const vowels = core.match(VOWELS)?.length ?? 0;
  return (
    CONSONANT_RUN.test(core) ||
    LETTER_AND_DIGIT.test(core) ||
    vowels / core.length < MAX_VOWEL_RATIO
  );
}

const PARTNERS: Readonly<Record<OpaqueClass, readonly OpaqueClass[]>> = {
  identifier: ['identifier', 'random', 'plain', 'number'],
  random: ['identifier', 'random', 'plain'],
  plain: ['identifier', 'random'],
  number: ['identifier'],
};

export function opaqueClassOf(token: string): OpaqueClass | undefined {
  const core = coreOf(token);
  if (core === ID || core === NUMBER) {
    return core === ID ? 'identifier' : 'number';
  }
  if (!PLAIN_TOKEN.test(core)) {
    return undefined;
  }
  return looksRandom(core) ? 'random' : 'plain';
}

export function opaquePartners(kind: OpaqueClass): readonly OpaqueClass[] {
  return PARTNERS[kind];
}

export function isOpaqueChange(left: string, right: string): boolean {
  const leftKind = opaqueClassOf(left);
  const rightKind = opaqueClassOf(right);
  return (
    leftKind !== undefined &&
    rightKind !== undefined &&
    opaquePartners(leftKind).includes(rightKind)
  );
}
