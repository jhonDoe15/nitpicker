import type { ExplainedCycle } from '../../../../../shared/graph/explained-cycles.mts';

export type ImportEdge = {
  readonly from: string;
  readonly to: string;
  readonly typeOnly: boolean;
};

export type FolderEdge = {
  readonly source: string;
  readonly target: string;
  readonly files: string;
};

export type FeatureView = {
  readonly explainedCycles: readonly ExplainedCycle[];
  readonly featureOf: (file: string | undefined) => string | undefined;
};
