import type { Finding } from '../../static-checks/shared.mts';

export type QualityAreaOptions = {
  readonly analyzerName: string;
  readonly kind: string;
  readonly projectRoot: string;
  readonly projectPolicyRoot: string;
  readonly policyRoot: string;
  readonly toolRoot: string;
  readonly liveProjectRoot: string;
  readonly snapshot: 'base' | 'head';
  readonly legacyInventory: string;
  readonly crapScoreLimit: number;
  readonly baselineRoot: string | undefined;
  readonly baselineMovesFile: string | undefined;
  readonly mutationScope: readonly string[] | undefined;
};

export type AreaReport = {
  readonly findings: readonly Finding[];
  readonly [field: string]: unknown;
};

export type AreaResult = Finding[] | AreaReport;

export type TextOutput = { write(text: string): unknown };
