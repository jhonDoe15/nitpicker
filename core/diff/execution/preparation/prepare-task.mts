import path from 'node:path';
import { PACKAGE_ROOT } from '../../../tooling/tool-resolution.mjs';
import { type Invocation, validateAnalyzer, validateInvocation } from '../validation/analyzers.mts';
import {
  type AnalyzerMetadata,
  recoverAnalyzerVersion,
  resolveAnalyzerMetadata,
  withResolvedMetadata,
} from '../report/analyzer-metadata.mts';

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
};

export type PreparedTask = {
  readonly name: string;
  readonly dependencies: readonly string[];
  readonly toleratedDependencyErrors: readonly string[];
  readonly concurrencyWeight: number;
  readonly concurrencyGroup: string | undefined;
  readonly executionPriority: number;
  readonly timeoutMs: number;
  readonly configuredTimeout: boolean;
  readonly reportedTools: readonly string[];
  readonly acceptedExitCodes: readonly number[];
  readonly invocation: Invocation;
};

const DEFAULT_ANALYZER_TIMEOUT_MS = 5 * 60 * 1000;

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
    ...logLocation(context.logRoot, liveProjectRoot),
  });
  validateInvocation(analyzer.name, invocation);
  return {
    name: analyzer.name,
    dependencies: analyzer.dependencies ?? [],
    toleratedDependencyErrors: analyzer.toleratedDependencyErrors ?? [],
    concurrencyWeight: analyzer.concurrencyWeight ?? 1,
    concurrencyGroup: analyzer.concurrencyGroup,
    executionPriority: analyzer.executionPriority ?? 0,
    timeoutMs: analyzer.timeoutMs ?? DEFAULT_ANALYZER_TIMEOUT_MS,
    configuredTimeout: analyzer['configuredTimeout'] === true,
    reportedTools: analyzer.reportedTools ?? [],
    acceptedExitCodes: [0, ...(analyzer.findingExitCodes ?? [])],
    invocation,
  };
}
