import {
  type Entry,
  type ShardReport,
  type ShardSummary,
  type UnchangedShard,
  commonSummary,
  readUnchangedShards as readShardsUnchanged,
} from './read-shards.mts';
import { parseArguments as readArguments } from './arguments.mts';
import {
  policyHash as untypedPolicyHash,
  sortByToolAndPath as untypedSort,
  summaryFields as untypedSummaryFields,
} from '../reporting/report-model.mjs';
import { resolveProjectRoot as untypedProjectRoot } from '../../configuration/project-checks/project-root.mjs';
import { configuredAnalyzers as untypedConfiguredAnalyzers } from '../../../languages/typescript/preset/diff/configured-analyzers.mjs';
import { withTroubleshooting as untypedWithTroubleshooting } from '../../../shared/messages/troubleshooting.mjs';
import { describeError as untypedDescribeError } from '../../../shared/messages/error-chain.mjs';
import {
  displayPath as untypedDisplayPath,
  withoutAnsi as untypedWithoutAnsi,
} from '../../../shared/messages/terminal/terminal-text.mjs';
import { type Analyzer, analyzersOf } from '../../../shared/values/analyzers.mts';
import type { TextOutput } from '../../cli-context.mts';
import type { ReportData } from '../../../shared/values/findings.mts';
import { textOf, textsOf } from '../../../shared/values/readers.mts';

export type { Entry, ShardEntries, ShardReport, UnchangedShard } from './read-shards.mts';
export { planAnalyzerShards } from './sharding.mts';
export { noChangesReport } from '../comparison/results.mts';
export { writeDiffReports } from '../reporting/reporters.mts';
export { resolveMetadata } from './metadata.mts';
export { commonSummary, readAndValidateShard, validateCommonSummaries } from './read-shards.mts';

type Warn = (message: string) => unknown;

export type AggregateRequest = {
  readonly inputRoot: string;
  readonly outputRoot: string;
  readonly analyzers?: readonly Analyzer[];
  readonly shardCount: number;
  readonly liveProjectRoot?: string | undefined;
  readonly policyRoot?: string | undefined;
  readonly configOverrides?: unknown[];
  readonly warn: Warn;
};

export type AggregateReport = ReportData & {
  readonly summary: Entry;
  text?: unknown;
};

export type AggregateOptions = {
  readonly kind: 'run';
  readonly inputRoot: string;
  readonly outputRoot?: string | undefined;
  readonly shardCount: number;
  readonly policyRoot?: string | undefined;
  readonly details: boolean;
};

export type AggregateCli = {
  readonly arguments_?: readonly string[];
  readonly currentProjectRoot?: string | undefined;
  readonly analyzers?: readonly Analyzer[] | undefined;
  readonly stdout?: TextOutput;
  readonly stderr?: TextOutput;
  readonly environment?: NodeJS.ProcessEnv;
};

export type RepositoryLocation = {
  readonly projectPath?: string | undefined;
  readonly repositoryRoot?: string | undefined;
};

export type PolicyRootRequest = {
  readonly optionsPolicyRoot: string | undefined;
  readonly currentProjectRoot: string;
};

export type ReportTarget = {
  readonly outputRoot: string;
  readonly liveProjectRoot: string | undefined;
};

export type UnchangedPolicy = {
  readonly analyzers: readonly Analyzer[];
  readonly configOverrides: unknown[];
};

export type ConfiguredTarget = {
  readonly currentProjectRoot: string;
  readonly outputRoot: string;
  readonly analyzers: readonly Analyzer[] | undefined;
  readonly warn: Warn;
};

export type ExitTarget = {
  readonly stdout: TextOutput;
  readonly stderr: TextOutput;
  readonly environment: NodeJS.ProcessEnv;
  readonly outputRoot: string;
  readonly currentProjectRoot: string;
  readonly details: boolean;
};

type SummaryRequest = {
  readonly shardReports: readonly ShardReport[];
  readonly analyzers: readonly Analyzer[];
  readonly configOverrides: unknown[];
  readonly newFindings: readonly Entry[];
  readonly toolErrors: readonly Entry[];
};

export function configuredAnalyzers(): readonly Analyzer[] {
  return analyzersOf(untypedConfiguredAnalyzers());
}

export function readUnchangedShards(
  inputRoot: string,
  shardCount: number,
): readonly [UnchangedShard, ...UnchangedShard[]] | undefined {
  const [first, ...rest] = readShardsUnchanged(inputRoot, shardCount) ?? [];
  return first === undefined ? undefined : [first, ...rest];
}
export function parseArguments(
  commandArguments: readonly string[],
): AggregateOptions | { readonly kind: 'help' } {
  return readArguments(commandArguments);
}
export const sortByToolAndPath: (entries: readonly Entry[]) => Entry[] = untypedSort;
export const resolveProjectRoot: () => string = untypedProjectRoot;
export const describeError: (error: unknown) => string = untypedDescribeError;
export const displayPath: (absolutePath: string) => unknown = untypedDisplayPath;
export const withoutAnsi: (text: string) => string = untypedWithoutAnsi;
const policyHash: (analyzers: readonly Analyzer[], configOverrides: unknown[]) => string =
  untypedPolicyHash;
const summaryFields: (configOverrides: unknown[], summary: ShardSummary) => Entry =
  untypedSummaryFields;

export function withTroubleshooting(message: string, anchor: unknown): string {
  return textOf(untypedWithTroubleshooting(message, anchor));
}

function analyzerExclusions(analyzers: readonly Analyzer[]): string[] {
  return [...new Set(analyzers.flatMap(({ exclusions }) => textsOf(exclusions)))].sort();
}

function firstSummary(shardReports: readonly ShardReport[]): ShardSummary {
  const [first] = shardReports;
  if (first === undefined) {
    throw new Error('Quality shard aggregation needs at least one shard');
  }
  return first.summary;
}

export function aggregateSummary({
  shardReports,
  analyzers,
  configOverrides,
  newFindings,
  toolErrors,
}: SummaryRequest): Entry {
  const toolsByName = new Map(
    shardReports.flatMap(({ summary }) => summary.tools.map((tool) => [tool.name, tool])),
  );
  return {
    ...commonSummary(firstSummary(shardReports)),
    policyHash: policyHash(analyzers, configOverrides),
    ...summaryFields(configOverrides, firstSummary(shardReports)),
    tools: analyzers.map(({ name }) => toolsByName.get(name)),
    exclusions: analyzerExclusions(analyzers),
    elapsedMs: Math.max(...shardReports.map(({ summary: shardSummary }) => shardSummary.elapsedMs)),
    overallStatus:
      toolErrors.length === 0 &&
      shardReports.every(({ summary: shardSummary }) => shardSummary.overallStatus === 'completed')
        ? 'completed'
        : 'tool-error',
    newEnforceableFindings: newFindings.filter(
      ({ classification }) => classification === 'enforceable',
    ).length,
    shards: shardReports.map(({ summary: shardSummary }, index) => ({
      index,
      analyzers: shardSummary.tools.map(({ name }) => name),
      elapsedMs: shardSummary.elapsedMs,
      status: shardSummary.overallStatus,
    })),
  };
}
