import type { Finding } from '../../static-checks/shared.mts';
import {
  addMetric as untypedAddMetric,
  declarationLine as untypedDeclarationLine,
  nameFreeHash as untypedNameFreeHash,
  nextOccurrence as untypedNextOccurrence,
  positiveInteger as untypedPositiveInteger,
  summaryMetrics as untypedSummaryMetrics,
  testsFailHeadline as untypedTestsFailHeadline,
  testsFailOnBase as untypedTestsFailOnBase,
} from '../../../../../shared/rules/finding-helpers.mjs';
import { branchCoverageFindings as untypedBranchCoverageFindings } from '../../../../../shared/rules/branch-coverage.mjs';
import { crapFindings as untypedCrapFindings } from '../../../../../shared/rules/crap.mjs';
import { mutantFindings as untypedMutantFindings } from '../../../../../shared/rules/mutation.mjs';
import {
  failingTestEntries as untypedFailingTestEntries,
  formattedValue as untypedFormattedValue,
  valuesInMessage as untypedValuesInMessage,
} from '../../../../../shared/rules/failing-tests/failing-tests.mjs';
import { stripAnsi as untypedStripAnsi } from '../../../../../shared/rules/console/ansi.mjs';
import { testsFailAnchor as untypedTestsFailAnchor } from '../../../../../shared/messages/troubleshooting.mjs';
import { functionIdentity as untypedFunctionIdentity } from '../../exceptions/function-identity.mjs';

export type Metric = {
  readonly analyzerName: string;
  readonly rule: string;
  readonly path: string;
  readonly identity: string;
  readonly message: string;
  readonly metricName: string;
  readonly value: unknown;
  readonly symbol?: string | undefined;
  readonly line?: number | undefined;
};

export type BranchInput = {
  readonly path: string;
  readonly key: string;
  readonly percent: number;
  readonly line: number | undefined;
  readonly arms: readonly string[] | undefined;
  readonly symbol: string | undefined;
};

export type CrapInput = {
  readonly path: string;
  readonly name: string;
  readonly identity: string;
  readonly ratchetKey: string;
  readonly anchor?: string;
  readonly declarationKey?: string;
  readonly line: number | undefined;
  readonly endLine: number | undefined;
  readonly crap: number | undefined;
};

export type NeutralMutant = {
  readonly path: string;
  readonly identity: string;
  readonly status: string;
  readonly label: string;
  readonly line: number | undefined;
  readonly [field: string]: unknown;
};

export type FailingTest = {
  readonly file: string;
  readonly name: string;
  readonly message: string;
  readonly line?: number;
  readonly expected?: unknown;
  readonly received?: unknown;
};

export type ShownValues = {
  readonly expected?: string | undefined;
  readonly received?: string | undefined;
};

export type FunctionIdentity = {
  readonly crapFunctionName: (entry: object) => string | undefined;
  readonly branchFunctionNames: (
    branchMap: unknown,
  ) => Readonly<Record<string, string | undefined>>;
  readonly functionNameAtLine: (line: number | undefined) => string | undefined;
};

export function addMetric(findings: Finding[], metric: Metric): void {
  Reflect.apply(untypedAddMetric, undefined, [findings, metric]);
}

export const summaryMetrics: (
  analyzerName: string,
  summary: Readonly<Record<string, unknown>> | undefined,
  rule: string,
) => Finding[] = untypedSummaryMetrics;

export const nextOccurrence: (occurrences: Map<string, number>, key: string) => number =
  untypedNextOccurrence;

export const positiveInteger: (value: unknown) => number | undefined = untypedPositiveInteger;

export const declarationLine: (text: string) => string = untypedDeclarationLine;

export const nameFreeHash: (text: string, name: string) => string = untypedNameFreeHash;

export const testsFailHeadline: (count: number, consequence: string) => string =
  untypedTestsFailHeadline;

export const testsFailOnBase: (tests: readonly string[]) => string = untypedTestsFailOnBase;

export const testsFailAnchor: (snapshot: string | undefined) => string | undefined =
  untypedTestsFailAnchor;

export const branchCoverageFindings: (
  branches: readonly BranchInput[],
  options: {
    readonly tool: string;
    readonly identify: (key: string, occurrence: number) => string;
  },
) => Finding[] = untypedBranchCoverageFindings;

export const crapFindings: (
  functions: readonly CrapInput[],
  options: { readonly tool: string; readonly limit: number; readonly unknownMessage: string },
) => Finding[] = untypedCrapFindings;

export const mutantFindings: (
  mutants: readonly NeutralMutant[],
  options: { readonly tool: string },
) => Finding[] = untypedMutantFindings;

export const failingTestEntries: (failures: readonly FailingTest[]) => string[] =
  untypedFailingTestEntries;

export const formattedValue: (value: unknown) => string = untypedFormattedValue;

export const valuesInMessage: (text: string) => ShownValues = untypedValuesInMessage;

export const stripAnsi: (text: string) => string = untypedStripAnsi;

export const functionIdentity: (source: string, file: string) => FunctionIdentity =
  untypedFunctionIdentity;
