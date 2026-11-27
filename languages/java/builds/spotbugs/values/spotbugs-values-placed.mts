import type { Placed } from '../spotbugs-placed.mts';

const ERROR = 'error';
const WARNING = 'warning';
const NOTE = 'note';

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
};
