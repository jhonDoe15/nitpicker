import { rule as noSwitchedOffTests } from './no-switched-off-tests.mjs';
import { rule as noUnownedAsyncAssertion } from './no-unowned-async-assertion.mjs';

export const testAssertionRules = {
  'no-switched-off-tests': noSwitchedOffTests,
  'no-unowned-async-assertion': noUnownedAsyncAssertion,
};
