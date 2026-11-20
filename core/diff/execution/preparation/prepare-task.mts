import path from 'node:path';
import { PACKAGE_ROOT } from '../../../tooling/tool-resolution.mts';
import { type Invocation, validateAnalyzer, validateInvocation } from '../validation/analyzers.mts';
import type { CarriedTask, TaskCheckpoint } from '../tasks.mts';
import {
  type AnalyzerMetadata,
  recoverAnalyzerVersion,
  resolveAnalyzerMetadata,
  withResolvedMetadata,
} from '../report/analyzer-metadata.mts';
import {
  type FileCounter,
  deadlineScaleOf,
  memoryEstimateMegabytes,
  moduleAllowanceMs,
  projectFileCount,
  scaledDeadlineMs,
  scaledFileCount,
} from './project-size.mts';

export type TaskContext = {
  readonly projectRoot: string;
  readonly policyRoot: string;
  readonly toolRoot: unknown;
  readonly snapshot: string;
  readonly baselineRoot: unknown;
  readonly baselineMovesFile: unknown;
  readonly liveProjectRoot: string;
  readonly mutationScope: unknown;
  readonly logRoot: unknown;
  readonly countFiles?: FileCounter;
  readonly carried?: readonly CarriedTask[];
};

export type PreparedTask = {
  readonly name: string;
  readonly dependencies: readonly string[];
  readonly toleratedDependencyErrors: readonly string[];
  readonly concurrencyWeight: number;
  readonly concurrencyGroup: string | undefined;
  readonly executionPriority: number;
  readonly timeoutMs: number;
  readonly sizeAllowanceMs: number;
  readonly memoryMegabytes: number;
  readonly configuredTimeout: boolean;
  readonly reportedTools: readonly string[];
  readonly acceptedExitCodes: readonly number[];
  readonly invocation: Invocation;
  readonly checkpoint?: TaskCheckpoint | undefined;
  readonly carried?: readonly CarriedTask[] | undefined;
};

const DEFAULT_ANALYZER_TIMEOUT_MS = 5 * 60 * 1000;

function sizeAllowanceMs(
  analyzer: Record<string, unknown>,
  liveProjectRoot: string,
  countFiles: FileCounter,
): number {
  const scale = deadlineScaleOf(analyzer);
  if (analyzer['configuredTimeout'] === true || scale === undefined) {
    return 0;
  }
  const modulesMs = moduleAllowanceMs(analyzer, liveProjectRoot);
  return scaledDeadlineMs(modulesMs, scale, scaledFileCount(scale, liveProjectRoot, countFiles));
}

function baseTimeoutMs(analyzer: Record<string, unknown>): number {
  return typeof analyzer['timeoutMs'] === 'number'
    ? analyzer['timeoutMs']
    : DEFAULT_ANALYZER_TIMEOUT_MS;
}

function logLocation(
  logRoot: unknown,
  liveProjectRoot: string,
): { readonly logRoot?: string; readonly logLabel?: string } {
  if (typeof logRoot !== 'string') {
    return {};
  }
  const relative = path.relative(liveProjectRoot, logRoot);
  const inside = relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
  return { logRoot, logLabel: inside ? relative.split(path.sep).join('/') : logRoot };
}

export type Preparation =
  | { readonly kind: 'ready'; readonly task: PreparedTask; readonly metadata: AnalyzerMetadata }
  | { readonly kind: 'failed'; readonly error: unknown; readonly metadata: AnalyzerMetadata };

function failedPreparation(
  analyzer: unknown,
  error: unknown,
  metadata: AnalyzerMetadata,
): Preparation {
  return {
    kind: 'failed',
    error,
    metadata: recoverAnalyzerVersion(analyzer, metadata) ?? metadata,
  };
}

export function prepareTask(
  analyzer: unknown,
  context: TaskContext,
  previous: AnalyzerMetadata | undefined,
): Preparation {
  const { policyRoot, liveProjectRoot } = context;
  const resolution = resolveAnalyzerMetadata(analyzer, { liveProjectRoot, policyRoot }, previous);
  if (resolution.kind === 'failed') {
    return failedPreparation(analyzer, resolution.error, resolution.metadata);
  }
  try {
    return {
      kind: 'ready',
      task: createTask(analyzer, resolution.metadata, context),
      metadata: resolution.metadata,
    };
  } catch (error) {
    return failedPreparation(analyzer, error, resolution.metadata);
  }
}

function createTask(
  source: unknown,
  metadata: AnalyzerMetadata,
  context: TaskContext,
): PreparedTask {
  const { projectRoot, policyRoot, toolRoot, snapshot, liveProjectRoot } = context;
  const countFiles = context.countFiles ?? projectFileCount;
  const carried = context.carried ?? [];
  const analyzer = withResolvedMetadata(source, metadata);
  validateAnalyzer(analyzer);
  const invocation = analyzer.createInvocation.call(source, {
    projectRoot,
    policyRoot: analyzer['policyFromPackage'] === true ? PACKAGE_ROOT : policyRoot,
    projectPolicyRoot: policyRoot,
    toolRoot,
    snapshot,
    baselineRoot: context.baselineRoot,
    baselineMovesFile: context.baselineMovesFile,
    liveProjectRoot,
    ...(context.mutationScope === undefined ? {} : { mutationScope: context.mutationScope }),
    ...(carried.length === 0 ? {} : { carried: carried.map(({ name }) => name) }),
    ...logLocation(context.logRoot, liveProjectRoot),
  });
  validateInvocation(analyzer.name, invocation);
  const allowanceMs = sizeAllowanceMs(analyzer, liveProjectRoot, countFiles);
  return {
    name: analyzer.name,
    dependencies: analyzer.dependencies ?? [],
    toleratedDependencyErrors: analyzer.toleratedDependencyErrors ?? [],
    concurrencyWeight: analyzer.concurrencyWeight ?? 1,
    concurrencyGroup: analyzer.concurrencyGroup,
    executionPriority: analyzer.executionPriority ?? 0,
    timeoutMs: baseTimeoutMs(analyzer) + allowanceMs,
    sizeAllowanceMs: allowanceMs,
    memoryMegabytes: memoryEstimateMegabytes(analyzer, liveProjectRoot, countFiles),
    configuredTimeout: analyzer['configuredTimeout'] === true,
    reportedTools: [...(analyzer.reportedTools ?? []), ...carried.map(({ name }) => name)],
    acceptedExitCodes: [0, ...(analyzer.findingExitCodes ?? [])],
    invocation,
    ...(carried.length === 0 ? {} : { carried }),
  };
}
