import type { Placed } from '../spotbugs-placed.mts';

const WARNING = 'warning';

export const UNRELEASED_LOCK_PATTERNS: readonly string[] = [
  'UL_UNRELEASED_LOCK',
  'UL_UNRELEASED_LOCK_EXCEPTION_PATH',
  'CWO_CLOSED_WITHOUT_OPENED',
];

export const RESOURCE_PATTERNS: readonly string[] = [...UNRELEASED_LOCK_PATTERNS];

export const RESOURCE_PLACED: Readonly<Record<string, Placed>> = {
  UL_UNRELEASED_LOCK: {
    text: 'Method does not release lock on all paths',
    levels: { 1: WARNING, 2: WARNING },
  },
  UL_UNRELEASED_LOCK_EXCEPTION_PATH: {
    text: 'Method does not release lock on all exception paths',
    levels: { 1: WARNING, 2: WARNING },
  },
};
