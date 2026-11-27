import type { Placed } from '../spotbugs-placed.mts';

const ERROR = 'error';
const NOTE = 'note';
const SHOWN = 'shown';

export const CAST_PATTERNS: readonly string[] = [
  'BC_BAD_CAST_TO_CONCRETE_COLLECTION',
  'BC_BAD_CAST_TO_ABSTRACT_COLLECTION',
  'BC_UNCONFIRMED_CAST',
  'BC_UNCONFIRMED_CAST_OF_RETURN_VALUE',
  'BC_IMPOSSIBLE_CAST',
  'BC_IMPOSSIBLE_INSTANCEOF',
  'BC_VACUOUS_INSTANCEOF',
  'NP_NULL_INSTANCEOF',
  'BC_IMPOSSIBLE_DOWNCAST',
  'BC_IMPOSSIBLE_DOWNCAST_OF_TOARRAY',
];

export const CAST_PLACED: Readonly<Record<string, Placed>> = {
  BC_BAD_CAST_TO_CONCRETE_COLLECTION: {
    text: 'Questionable cast to concrete collection',
    levels: { 1: NOTE, 2: NOTE },
    placement: SHOWN,
  },
  BC_BAD_CAST_TO_ABSTRACT_COLLECTION: {
    text: 'Questionable cast to abstract collection',
    levels: { 1: NOTE, 2: NOTE },
    placement: SHOWN,
  },
  BC_UNCONFIRMED_CAST: {
    text: 'Unchecked/unconfirmed cast',
    levels: { 1: NOTE, 2: NOTE },
    placement: SHOWN,
  },
  BC_UNCONFIRMED_CAST_OF_RETURN_VALUE: {
    text: 'Unchecked/unconfirmed cast of return value from method',
    levels: { 1: NOTE, 2: NOTE },
    placement: SHOWN,
  },
  BC_IMPOSSIBLE_CAST: { text: 'Impossible cast', levels: { 1: ERROR, 2: ERROR }, placement: SHOWN },
  BC_IMPOSSIBLE_INSTANCEOF: {
    text: 'instanceof will always return false',
    levels: { 1: ERROR, 2: ERROR },
    placement: SHOWN,
  },
  BC_VACUOUS_INSTANCEOF: {
    text: 'instanceof will always return true',
    levels: { 1: NOTE, 2: NOTE },
    placement: SHOWN,
  },
  NP_NULL_INSTANCEOF: {
    text: 'A known null value is checked to see if it is an instance of a type',
    levels: { 1: ERROR, 2: ERROR },
    placement: SHOWN,
  },
  BC_IMPOSSIBLE_DOWNCAST: {
    text: 'Impossible downcast',
    levels: { 1: ERROR, 2: ERROR },
    placement: SHOWN,
  },
  BC_IMPOSSIBLE_DOWNCAST_OF_TOARRAY: {
    text: 'Impossible downcast of toArray() result',
    levels: { 1: ERROR, 2: ERROR },
    placement: SHOWN,
  },
};
