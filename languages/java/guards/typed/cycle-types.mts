export type CycleEdge = { readonly source: string; readonly target: string };

export type FileEdge = CycleEdge & { readonly files: string };

type ExplainedCycle = {
  readonly features: readonly string[];
  readonly edges: readonly { readonly from: string; readonly to: string }[];
};

export type CycleFeatures = {
  readonly explainedCycles: readonly ExplainedCycle[];
  readonly featureOf: (file: string) => string | undefined;
  readonly generatedFiles: ReadonlySet<string>;
};

export type CycleGraph = {
  readonly modules: readonly string[];
  readonly edges: readonly CycleEdge[];
  readonly packageOf: (name: string) => string;
  readonly fileOf: (name: string) => string;
};

export type ExplainedCycleCheck = (
  members: readonly string[],
  context: {
    readonly packaged: readonly FileEdge[];
    readonly anchor: ReadonlyMap<string, string>;
    readonly features: CycleFeatures;
  },
) => boolean;
