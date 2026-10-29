import { rule as noFloatEqualityInTests } from './no-float-equality-in-tests.mjs';
import { rule as noSwitchedOffTests } from './no-switched-off-tests.mjs';
import { rule as noUnownedAsyncAssertion } from './unowned-async/no-unowned-async-assertion.mjs';

export const testAssertionRules = {
  'no-float-equality-in-tests': noFloatEqualityInTests,
  'no-switched-off-tests': noSwitchedOffTests,
  'no-unowned-async-assertion': noUnownedAsyncAssertion,
};
