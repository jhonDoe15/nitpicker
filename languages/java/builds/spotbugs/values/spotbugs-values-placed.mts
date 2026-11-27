import type { Placed } from '../spotbugs-placed.mts';

const ERROR = 'error';
const WARNING = 'warning';
const NOTE = 'note';

export const VALUE_DETECTORS: Readonly<Record<string, readonly string[]>> = {
  OptionalReturnNull: ['NP_OPTIONAL_RETURN_NULL'],
};

export const VALUES_PLACED: Readonly<Record<string, Placed>> = {
  SR_NOT_CHECKED: {
    text: 'Method ignores results of InputStream.skip()',
    levels: { 1: WARNING, 2: NOTE },
    placement: 'shown',
  },
  RR_NOT_CHECKED: {
    text: 'Method ignores results of InputStream.read()',
    levels: { 1: WARNING, 2: NOTE },
    placement: 'shown',
  },
  UR_UNINIT_READ: {
    text: 'Uninitialized read of field in constructor',
    levels: { 1: ERROR, 2: ERROR },
  },
  HARD_CODE_PASSWORD: {
    text: 'Hard coded password',
    levels: { 1: WARNING, 2: WARNING },
    placement: 'shown',
  },
  UC_USELESS_CONDITION: {
    text: 'Condition has no effect',
    levels: { 1: WARNING, 2: NOTE },
  },
  UC_USELESS_CONDITION_TYPE: {
    text: 'Condition has no effect due to the variable type',
    levels: { 1: WARNING, 2: NOTE },
  },
  HARD_CODE_KEY: {
    text: 'Hard coded key',
    levels: { 1: WARNING, 2: WARNING },
    placement: 'shown',
  },
  NP_OPTIONAL_RETURN_NULL: {
    text: 'Method with Optional return type returns explicit null',
    levels: { 1: ERROR },
  },
};
