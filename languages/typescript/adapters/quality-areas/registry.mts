import type { Finding } from '../static-checks/shared.mts';
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
import { runTestConsole } from './runners/console/test-console.mjs';

export type QualityAreaOptions = {
  readonly analyzerName: string;
  readonly kind: string;
  readonly projectRoot: string;
  readonly projectPolicyRoot: string;
  readonly policyRoot: string;
  readonly toolRoot: string;
  readonly liveProjectRoot: string;
  readonly snapshot: 'base' | 'head';
  readonly legacyInventory: string;
  readonly crapScoreLimit: number;
  readonly baselineRoot: string | undefined;
  readonly baselineMovesFile: string | undefined;
  readonly mutationScope: readonly string[] | undefined;
};

export type AreaReport = {
  readonly findings: readonly Finding[];
  readonly [field: string]: unknown;
};

export type AreaResult = Finding[] | AreaReport;

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
