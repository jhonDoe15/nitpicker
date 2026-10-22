import { rule as fakeTimersRequireRestore } from './fake-timers-require-restore.mjs';
import { rule as noCopyPastedTests } from './no-copy-pasted-tests.mjs';
import { rule as noSharedTestState } from './no-shared-test-state.mjs';

export const testQualityRules = {
  'fake-timers-require-restore': fakeTimersRequireRestore,
  'no-copy-pasted-tests': noCopyPastedTests,
  'no-shared-test-state': noSharedTestState,
};
