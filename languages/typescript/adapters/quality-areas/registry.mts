import type { AreaResult, QualityAreaOptions } from './typed/area-types.mts';
import { runPolicyTests, runCoverage, runCrap } from './runners/tests.mts';
import {
  runCodingStandards,
  runCoupling,
  runTestRuntime,
  runStructure,
  runDeadCode,
} from './runners/repository.mts';
import { runDuplicates } from './runners/duplicates/duplicates.mts';
import { runMutation } from './runners/mutation.mjs';
import { runTestConsole } from './runners/console/test-console.mts';

type AreaRunner = (options: QualityAreaOptions) => AreaResult | Promise<AreaResult>;

export const QUALITY_AREA_RUNNERS: ReadonlyMap<string, AreaRunner> = new Map<string, AreaRunner>([
  ['policy-tests', runPolicyTests],
  ['coding-standards', runCodingStandards],
  ['coupling', runCoupling],
  ['test-runtime', runTestRuntime],
  ['structure', runStructure],
  ['duplicates', runDuplicates],
  ['dead-code', runDeadCode],
  ['coverage', runCoverage],
  ['crap', runCrap],
  ['test-console', runTestConsole],
  ['mutation', runMutation],
]);
