import {
  commonSummary as untypedCommonSummary,
  readAndValidateShard as untypedReadShard,
  readUnchangedShards as untypedReadUnchanged,
  validateCommonSummaries as untypedValidateSummaries,
} from './read-shards.mjs';
import { planAnalyzerShards as untypedPlan } from './sharding.mjs';
import { resolveMetadata as untypedResolveMetadata } from './metadata.mjs';
import { parseArguments as untypedParseArguments } from './arguments.mjs';
import { noChangesReport as untypedNoChangesReport } from '../comparison/results.mjs';
import { writeDiffReports as untypedWriteReports } from '../reporting/reporters.mjs';
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
import { textOf, textsOf } from '../../../shared/values/readers.mts';

export type Entry = Readonly<Record<string, unknown>> & {
  readonly tool?: unknown;
  readonly name?: unknown;
  readonly message?: unknown;
  readonly classification?: unknown;
};

export type ShardSummary = Entry & {
  readonly tools: readonly Entry[];
  readonly elapsedMs: number;
  readonly overallStatus: string;
};

export type ShardEntries = {
  readonly newFindings: readonly Entry[];
  readonly resolvedFindings: readonly Entry[];
  readonly changedMetrics: readonly Entry[];
  readonly heldFindings: readonly Entry[];
  readonly toolErrors: readonly Entry[];
  readonly notes: readonly Entry[];
};

export type ShardReport = ShardEntries & { readonly summary: ShardSummary };

export type Warn = (message: string) => unknown;

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

export type AggregateReport = {
  readonly summary: Entry;
  text?: unknown;
};

export type UnchangedShard = {
  readonly summary: ShardSummary;
  readonly toolErrors: readonly Entry[];
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

export const planAnalyzerShards: (
  analyzers: readonly Analyzer[],
  shardCount: number,
) => readonly (readonly Analyzer[])[] = untypedPlan;
export const readAndValidateShard: (
  inputRoot: string,
  index: number,
  expected: readonly Analyzer[],
) => ShardReport = untypedReadShard;
export function readUnchangedShards(
  inputRoot: string,
  shardCount: number,
): readonly [UnchangedShard, ...UnchangedShard[]] | undefined {
  const shards: readonly UnchangedShard[] | undefined = untypedReadUnchanged(inputRoot, shardCount);
  const [first, ...rest] = shards ?? [];
  return first === undefined ? undefined : [first, ...rest];
}
export const validateCommonSummaries: (shardReports: readonly ShardReport[]) => unknown =
  untypedValidateSummaries;
export const resolveMetadata: (request: {
  readonly analyzers: readonly Analyzer[];
  readonly liveProjectRoot: string | undefined;
  readonly policyRoot: string | undefined;
  readonly inputRoot: string;
  readonly warn: Warn;
}) => readonly Entry[] = untypedResolveMetadata;
export const noChangesReport: (context: object) => AggregateReport & {
  readonly summary: Entry & { elapsedMs?: number };
} = untypedNoChangesReport;
export const writeDiffReports: (
  outputRoot: string,
  report: AggregateReport,
  location: RepositoryLocation,
) => unknown = untypedWriteReports;
type ParsedArguments = {
  readonly kind: string;
  readonly inputRoot?: string;
  readonly outputRoot?: string | undefined;
  readonly shardCount?: number;
  readonly policyRoot?: string | undefined;
  readonly details?: unknown;
};

const readArguments: (commandArguments: readonly string[]) => ParsedArguments =
  untypedParseArguments;

export function parseArguments(
  commandArguments: readonly string[],
): AggregateOptions | { readonly kind: 'help' } {
  const { kind, inputRoot, outputRoot, shardCount, policyRoot, details } =
    readArguments(commandArguments);
  return kind === 'help' || inputRoot === undefined || shardCount === undefined
    ? { kind: 'help' }
    : { kind: 'run', inputRoot, outputRoot, shardCount, policyRoot, details: details === true };
}
export const commonSummary: (summary: ShardSummary) => Entry = untypedCommonSummary;
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
