import type { BaseMoves, MoveFields } from '../moved-names/declared/move-types.mts';
import type { Finding } from '../../../../shared/values/findings.mts';
import type { FindingPair, MatchedCode, TrackedFinding } from './finding-types.mts';

type Snapshot = 'base' | 'head';
type Touched = MatchedCode | undefined;
type Indexed = Map<string, TrackedFinding>;

export type ChangedMetric = {
  readonly tool: string;
  readonly rule: string;
  readonly path: string;
  readonly symbol: string | undefined;
  readonly identity: string;
  readonly message: string;
  readonly metric: string;
  readonly baseValue: number;
  readonly headValue: number;
  readonly delta: number;
};

export type Compared = {
  readonly newFindings: TrackedFinding[];
  readonly resolvedFindings: TrackedFinding[];
  readonly unchangedFindings: TrackedFinding[];
  readonly changedMetrics: ChangedMetric[];
};

export type Present = {
  newFindings: TrackedFinding[];
  unchangedFindings: TrackedFinding[];
  readonly changedMetrics: ChangedMetric[];
  readonly withoutBase: Set<TrackedFinding>;
};

export type Classified =
  | { readonly bucket: 'newFindings' | 'unchangedFindings'; readonly entry: TrackedFinding }
  | { readonly bucket: 'changedMetrics'; readonly entry: ChangedMetric };

export type CompareRequest = MoveFields & {
  readonly baseFindings: readonly TrackedFinding[];
  readonly headFindings: readonly TrackedFinding[];
  readonly touchedCode: Touched;
  readonly unknownOnBase?: ((finding: Finding) => boolean) | undefined;
};

export type IndexRequest = {
  readonly baseFindings: readonly TrackedFinding[];
  readonly headFindings: readonly TrackedFinding[];
  readonly moves: BaseMoves;
  readonly touchedCode: Touched;
};

export type MoveContext = { readonly moves: BaseMoves; readonly touchedCode: Touched };

export type AnchorRequest = {
  readonly baseFindings: readonly TrackedFinding[];
  readonly snapshots: {
    readonly base: readonly TrackedFinding[];
    readonly head: readonly TrackedFinding[];
  };
  readonly renames: ReadonlyMap<string, string>;
  readonly touchedCode: Touched;
};

export type SettleRequest = {
  readonly pairs: readonly FindingPair[];
  readonly baseFindings: readonly TrackedFinding[];
  readonly touchedCode: Touched;
};

export type ClassifyRequest = {
  readonly headByKey: Indexed;
  readonly baseByKey: Indexed;
  readonly touchedCode: Touched;
  readonly unknownOnBase: CompareRequest['unknownOnBase'];
};

export type ClassifyContext = { readonly touchedCode: Touched; readonly isUnknown: boolean };

export type IndexFindingsRequest = {
  readonly findings: readonly TrackedFinding[];
  readonly moves?: BaseMoves;
  readonly snapshot: Snapshot;
  readonly keys?: ReadonlyMap<TrackedFinding, string>;
};
