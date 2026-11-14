import type { CaptureHead } from '../../../staged/capture-index.mts';
import type { RunSettings, SkipPlan, SnapshotRoots } from './run-types.mts';
import type { Comparison, SnapshotLayout } from './layout.mts';
import type { ReportEntry } from '../../../../shared/values/findings.mts';

type NoticeContext = {
  readonly mergeBaseSha: string;
  readonly touchedPaths: readonly string[];
};

type BaseSnapshot = SnapshotRoots & {
  readonly liveProjectRoot: string;
  readonly moves: unknown;
  readonly analyzers: RunSettings['analyzers'];
};

export type DiffOptions = Omit<
  RunSettings,
  'headProjectRoot' | 'configOverrides' | 'headPolicy'
> & {
  readonly outputRoot: string;
  readonly headProjectRoot?: string | undefined;
  readonly requestedBaseRef?: unknown;
  readonly partialRun?: unknown;
  readonly includeWorkingTree?: true | undefined;
  readonly captureHead?: unknown;
  readonly staged?: unknown;
  readonly additionalToolErrors?: unknown;
  readonly configOverrides?: unknown;
  readonly headPolicy?: unknown;
  readonly resolveBaseSetup?: ((snapshot: BaseSnapshot) => unknown) | undefined;
  readonly describeNotices?:
    ((changedFiles: readonly string[], context: NoticeContext) => unknown) | undefined;
  readonly acceptPolicyChange?: unknown;
  readonly policyAcceptanceSource?: unknown;
  readonly reportsPolicy?: unknown;
  readonly warn?: unknown;
};

export type Settings = Omit<DiffOptions, 'includeWorkingTree'> &
  RunSettings & {
    readonly includeWorkingTree: boolean;
    readonly captureHead: CaptureHead;
    readonly additionalToolErrors: readonly ReportEntry[];
    readonly configOverrides: readonly unknown[];
  };

export type BaseSetup = {
  readonly analyzers: unknown;
  readonly headPolicy: unknown;
  readonly configOverrides: unknown;
  readonly policyChanges: unknown;
  readonly policyLoosenings: unknown;
  readonly policyKinds?: unknown;
  readonly policyDigest?: unknown;
};

export type SnapshotContext = {
  readonly settings: Settings;
  readonly comparison: Comparison;
  readonly layout: SnapshotLayout;
  readonly roots: SnapshotRoots;
  readonly startedAt: number;
};

export type PolicyContext = SnapshotContext & {
  readonly baseSetup: BaseSetup;
  readonly skipPlan: SkipPlan;
};

export type RunContext = PolicyContext & {
  readonly headPolicyFile: unknown;
  readonly basePolicyFile: unknown;
};
