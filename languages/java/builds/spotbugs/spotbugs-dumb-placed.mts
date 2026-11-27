import type { Placed } from './spotbugs-placed.mts';

const NOTE = 'note';
const RELATIVE = 'relative';

export const URL_PATTERNS: readonly string[] = [
  'DMI_COLLECTION_OF_URLS',
  'DMI_BLOCKING_METHODS_ON_URL',
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
};
