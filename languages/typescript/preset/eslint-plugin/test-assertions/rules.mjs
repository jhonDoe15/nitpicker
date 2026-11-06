import { rule as noAssertionInLoop } from './loop-assertions/no-assertion-in-loop.mjs';
import { rule as noSwitchedOffTests } from './no-switched-off-tests.mjs';
import { rule as noTestRetry } from './no-test-retry.mjs';
import { rule as noUnownedAsyncAssertion } from './unowned-async/no-unowned-async-assertion.mjs';

export const testAssertionRules = {
  'no-assertion-in-loop': noAssertionInLoop,
  'no-switched-off-tests': noSwitchedOffTests,
  'no-test-retry': noTestRetry,
  'no-unowned-async-assertion': noUnownedAsyncAssertion,
};
