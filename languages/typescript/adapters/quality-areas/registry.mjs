import { runPolicyTests, runCoverage, runCrap } from './runners/tests.mjs';

import {
  runCodingStandards,
  runCoupling,
  runTestRuntime,
  runStructure,
  runDuplicates,
  runDeadCode,
} from './runners/repository.mjs';

import { runMutation } from './runners/mutation.mjs';

export const QUALITY_AREA_RUNNERS = new Map([
  ['policy-tests', runPolicyTests],
  ['coding-standards', runCodingStandards],
  ['coupling', runCoupling],
  ['test-runtime', runTestRuntime],
  ['structure', runStructure],
  ['duplicates', runDuplicates],
  ['dead-code', runDeadCode],
  ['coverage', runCoverage],
  ['crap', runCrap],
  ['mutation', runMutation],
]);
