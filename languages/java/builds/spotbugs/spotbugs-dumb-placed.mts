import type { Placed } from './spotbugs-placed.mts';

const NOTE = 'note';
const RELATIVE = 'relative';

export const URL_PATTERNS: readonly string[] = [
  'DMI_COLLECTION_OF_URLS',
  'DMI_BLOCKING_METHODS_ON_URL',
];

export const BOXING_PATTERNS: readonly string[] = [
  'DM_STRING_CTOR',
  'DM_STRING_VOID_CTOR',
  'DM_BOOLEAN_CTOR',
  'DM_BOXED_PRIMITIVE_FOR_PARSING',
  'DM_BOXED_PRIMITIVE_TOSTRING',
  'DM_BOXED_PRIMITIVE_FOR_COMPARE',
  'DM_NEW_FOR_GETCLASS',
  'DM_STRING_TOSTRING',
];

export const DUMB_PLACED: Readonly<Record<string, Placed>> = {
  DMI_COLLECTION_OF_URLS: {
    text: 'Maps and sets of URLs can be performance hogs',
    levels: { 1: NOTE },
    placement: RELATIVE,
  },
  DMI_BLOCKING_METHODS_ON_URL: {
    text: 'The equals and hashCode methods of URL are blocking',
    levels: { 1: NOTE },
    placement: RELATIVE,
  },
  DM_STRING_CTOR: {
    text: 'Method invokes inefficient new String(String) constructor',
    levels: { 2: NOTE },
  },
  DM_STRING_VOID_CTOR: {
    text: 'Method invokes inefficient new String() constructor',
    levels: { 2: NOTE },
  },
  DM_BOOLEAN_CTOR: {
    text: 'Method invokes inefficient Boolean constructor; use Boolean.valueOf(...) instead',
    levels: { 2: NOTE },
  },
  DM_BOXED_PRIMITIVE_FOR_PARSING: {
    text: 'Boxing/unboxing to parse a primitive',
    levels: { 1: NOTE },
    placement: RELATIVE,
  },
  DM_BOXED_PRIMITIVE_TOSTRING: {
    text: 'Method allocates a boxed primitive just to call toString',
    levels: { 1: NOTE, 2: NOTE },
    placement: RELATIVE,
  },
  DM_BOXED_PRIMITIVE_FOR_COMPARE: {
    text: 'Boxing a primitive to compare',
    levels: { 1: NOTE, 2: NOTE },
    placement: RELATIVE,
  },
  DM_NEW_FOR_GETCLASS: {
    text: 'Method allocates an object, only to get the class object',
    levels: { 2: NOTE },
  },
};
