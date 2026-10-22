import { rule as noProductionImportsInSetupFiles } from './no-production-imports-in-setup-files.mjs';
import { rule as noRealTimeRandomOrNetwork } from './no-real-time-random-or-network.mjs';
import { rule as noUncollectedTests } from './no-uncollected-tests.mjs';

export const testIsolationRules = {
  'no-production-imports-in-setup-files': noProductionImportsInSetupFiles,
  'no-real-time-random-or-network': noRealTimeRandomOrNetwork,
  'no-uncollected-tests': noUncollectedTests,
};
