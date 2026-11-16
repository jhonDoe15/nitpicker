import { BRANCH_BUILDERS } from './branches.mjs';
import { CRAP_BUILDERS } from './crap.mjs';
import { MUTANT_BUILDERS } from './mutants.mjs';

export const COVERAGE_BUILDERS = [...BRANCH_BUILDERS, ...CRAP_BUILDERS, ...MUTANT_BUILDERS];
