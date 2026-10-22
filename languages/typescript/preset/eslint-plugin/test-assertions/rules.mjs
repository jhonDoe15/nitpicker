import { rule as noSwitchedOffTests } from './no-switched-off-tests.mjs';
import { rule as noUnpinnedAssertion } from './no-unpinned-assertion.mjs';

export const testAssertionRules = {
  'no-switched-off-tests': noSwitchedOffTests,
  'no-unpinned-assertion': noUnpinnedAssertion,
};
