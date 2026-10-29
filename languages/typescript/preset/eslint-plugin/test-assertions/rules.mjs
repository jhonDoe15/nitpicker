import { rule as noSwitchedOffTests } from './no-switched-off-tests.mjs';
import { rule as noWeakAssertion } from './weak-assertion/no-weak-assertion.mjs';
import { rule as noUnownedAsyncAssertion } from './unowned-async/no-unowned-async-assertion.mjs';

export const testAssertionRules = {
  'no-switched-off-tests': noSwitchedOffTests,
  'no-unowned-async-assertion': noUnownedAsyncAssertion,
  'no-weak-assertion': noWeakAssertion,
};
