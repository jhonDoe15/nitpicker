import type { ExceptionEntry } from '../../configuration/python-exceptions.mts';
import type { IngestedFinding, ReportPolicy } from '../report/report-types.mts';

export type RunnerSettings = {
  readonly exceptions?: readonly ExceptionEntry[];
  readonly [field: string]: unknown;
};

export type RunnerPolicy = ReportPolicy & {
  readonly exclude?: readonly string[];
  readonly duplicateSkippedFolders?: unknown;
  readonly quick?: unknown;
  readonly conventions?: unknown;
  readonly policyRoot?: unknown;
  readonly toolPrecedence?: unknown;
  readonly mutationScope?: unknown;
  readonly baselineMovesFile?: string | undefined;
};

export type RunnerOptions = {
  readonly projectRoot: string;
  readonly liveRoot: string;
  readonly settings: RunnerSettings;
  readonly policy: RunnerPolicy;
  readonly spawn?: unknown;
};

export type RunnerReport = {
  readonly findings: IngestedFinding[];
  readonly [section: string]: unknown;
};

export type ToolFailure = { readonly rule: string; readonly message: string };

export type ParsedArguments = RunnerOptions & { readonly part: string };
