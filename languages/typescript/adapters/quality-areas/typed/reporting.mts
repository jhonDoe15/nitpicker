import type { Finding, NodeToolResult } from '../../static-checks/shared.mts';
import type { Mutant } from './mutation.mts';
import type { TestReport } from '../../test-runners/typed/runner-types.mts';
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

type Position = { readonly line?: number; readonly column?: number };

export type Span = { readonly start?: Position; readonly end?: Position };

export type BranchMapEntry = {
  readonly type?: string;
  readonly loc?: Span;
  readonly locations?: readonly Span[];
};

export type FileCoverage = {
  readonly b?: Readonly<Record<string, readonly number[]>>;
  readonly branchMap?: Readonly<Record<string, BranchMapEntry>>;
  readonly branchSourceHashes?: Readonly<Record<string, string>>;
  readonly uncoveredArms?: Readonly<Record<string, readonly string[]>>;
  readonly branchFunctions?: Readonly<Record<string, string | undefined>>;
};

export type CoverageReport = Readonly<Record<string, FileCoverage>>;

type Percent = { readonly percent?: number };

export type CrapEntry = {
  readonly source: string;
  readonly function: string;
  readonly crap?: number;
  readonly complexity?: number;
  readonly start?: number;
  readonly end?: number;
  readonly lines?: { readonly start?: number; readonly end?: number };
  readonly sourceHash?: string;
  readonly anchorHash?: string;
  readonly declarationHash?: string;
  readonly statementCoverage?: Percent;
  readonly branchCoverage?: Percent;
  readonly effectiveCoverage?: Percent;
};

export type CrapReport = {
  readonly summary?: Readonly<Record<string, unknown>>;
  readonly functions?: readonly CrapEntry[];
};

export type CoverageOptions = { readonly projectRoot: string; readonly testCount: unknown };

export type FileCoverageTarget = { readonly analyzerName: string; readonly relativePath: string };

export type Efficiency = { readonly coveredBranchOutcomes: number; readonly testCount: number };

export type CrapSite = {
  readonly analyzerName: string;
  readonly scoreLimit: number;
  readonly occurrence: number;
  readonly violationOccurrence: number;
};

export type MutantTally = {
  readonly filePath: string;
  readonly mutants: NeutralMutant[];
  readonly statusCounts: Map<string, number>;
  readonly occurrences: Map<string, number>;
};

export type ReportedFile = { readonly mutants?: readonly Partial<Mutant>[] };

export type MutantSite = {
  readonly filePath: string;
  readonly status: string;
  readonly occurrences: Map<string, number>;
};

export type ToolErrorDetails = {
  readonly rule: string;
  readonly path?: string | undefined;
  readonly message: string;
  readonly anchor: string | undefined;
};

export type ProjectTestRun = {
  readonly report: TestReport;
  readonly result: NodeToolResult;
  readonly runnerName: string;
  readonly precedingCommands: unknown;
};

export type Failure = {
  readonly file: string;
  readonly name: string;
  readonly assertion: string;
  readonly line?: number;
  readonly expected?: unknown;
  readonly received?: unknown;
};

export type FailureContext = {
  readonly runnerName?: string | undefined;
  readonly precedingCommands?: unknown;
  readonly snapshot?: string | undefined;
};

export type ProcessOutput = { readonly stderr?: unknown; readonly stdout?: unknown };

export type Point = NonNullable<Span['start']>;

export type KnipReport = {
  readonly files?: readonly string[];
  readonly issues?: readonly Readonly<Record<string, unknown>>[];
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
