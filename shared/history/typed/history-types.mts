import type { FeatureLayoutInput } from '../../rules/features/typed/role-types.mts';
import type { HygienePolicy } from '../../hygiene/check-types.mts';

export type CoChangeSettings = {
  readonly commits: number;
  readonly minSupport: number;
  readonly minConfidence: number;
  readonly maxCommitFiles: number;
};

export type HistoryPolicy = HygienePolicy & {
  readonly history?: {
    readonly coChange?: unknown;
    readonly commits?: number;
    readonly minSupport?: number;
    readonly minConfidence?: number;
    readonly maxCommitFiles?: number;
  };
  readonly layout?: FeatureLayoutInput & { readonly testRoots?: readonly string[] };
  readonly generatedFiles?: readonly string[];
};

export type HistoryEntry = {
  readonly kind: string;
  readonly exact: boolean;
  readonly from?: string;
  readonly path: string;
};

export type HistoryCommit = { readonly sha: string; readonly entries: HistoryEntry[] };

export type UnavailableHistory =
  | { readonly available: false; readonly reason: 'shallow' }
  | { readonly available: false; readonly reason: 'git-missing' }
  | { readonly available: false; readonly reason: 'not-a-repository' }
  | { readonly available: false; readonly reason: 'too-few'; readonly count: number }
  | { readonly available: false; readonly reason: 'unreadable'; readonly detail: string };

export type AvailableHistory = { readonly available: true; readonly commits: HistoryCommit[] };

export type ModuleOf = (file: string) => string | undefined;

export type EvidencePair = {
  readonly first: string;
  readonly second: string;
  readonly support: number;
  readonly examples: readonly string[];
  readonly firstCommits: number;
  readonly secondCommits: number;
  readonly confidence: number;
};

export type PairEntry = { support: number; examples: string[] };

export type CollectedEvidence = {
  readonly used: number;
  readonly names: readonly string[];
  readonly commitsOf: readonly number[];
  readonly pairs: ReadonlyMap<number, PairEntry>;
};

type DisabledEvidence = { readonly enabled: false };
export type UnavailableEvidence = {
  readonly enabled: true;
  readonly settings: CoChangeSettings;
  readonly history: UnavailableHistory;
};
export type ReadyEvidence = {
  readonly enabled: true;
  readonly settings: CoChangeSettings;
  readonly history: AvailableHistory;
  readonly moduleOf: ModuleOf;
  readonly used: number;
  readonly pairs: readonly EvidencePair[];
};
export type ProjectEvidence = DisabledEvidence | UnavailableEvidence | ReadyEvidence;

export function isReady(evidence: UnavailableEvidence | ReadyEvidence): evidence is ReadyEvidence {
  return evidence.history.available;
}
