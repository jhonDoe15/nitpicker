import type { Finding } from '../static-checks/shared.mts';
import {
  slowestRuns as untypedSlowestRuns,
  slowTestBudget as untypedSlowTestBudget,
  slowTestFindings as untypedSlowTestFindings,
  slowTestLimits as untypedSlowTestLimits,
} from '../../../../shared/rules/slow-tests/slow-test-finding.mjs';
import { exceptionMatcher as untypedExceptionMatcher } from '../../../../shared/rules/exceptions.mjs';

export type TestRunTime = {
  readonly file: string;
  readonly name: string;
  readonly seconds: number;
};

export type TestTimeLimits = Readonly<Record<string, number>>;

export type SlowTest = {
  readonly path: string;
  readonly name: string;
  readonly identity: string;
  readonly seconds: number;
  readonly line?: number;
};

export const slowTestLimits: (thresholds: unknown) => TestTimeLimits = untypedSlowTestLimits;

export const slowTestBudget: (limits: TestTimeLimits) => {
  readonly unitTestSeconds: number;
  readonly integrationTestSeconds: number;
} = untypedSlowTestBudget;

export const slowestRuns: (
  runs: readonly TestRunTime[],
  keyOf: (run: TestRunTime) => string,
) => TestRunTime[] = untypedSlowestRuns;

export const slowTestFindings: (request: {
  readonly tool: string;
  readonly language: string;
  readonly integration: boolean;
  readonly limits: TestTimeLimits;
  readonly test: SlowTest;
}) => Finding[] = untypedSlowTestFindings;

export const exceptionMatcher: (
  exceptions: readonly unknown[],
) => (rule: string, ...candidates: readonly string[]) => boolean = untypedExceptionMatcher;
