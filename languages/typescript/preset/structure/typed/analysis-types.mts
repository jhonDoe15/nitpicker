import type TypeScript from 'typescript';

export type Metric = 'lines' | 'statements' | 'maxControlNesting' | 'parameters' | 'members';

export type Measured = Partial<Record<Metric, number>>;

export type Ranked = Measured & {
  readonly start?: number;
  readonly source: string;
  readonly function?: string | undefined;
  readonly class?: string;
};

export type WalkStep = {
  readonly node: TypeScript.Node;
  readonly depth: number;
  readonly parent: TypeScript.Node;
};

export type FunctionMetrics = { readonly statements: number; readonly maxControlNesting: number };

type Span = { readonly start: number; readonly end: number; readonly lines: number };

export type AnalysisFunction = Span &
  FunctionMetrics & {
    readonly source: string;
    readonly function: string | undefined;
    readonly parameters: number;
  };

export type AnalysisClass = Span & {
  readonly source: string;
  readonly class: string;
  readonly members: number;
  readonly methods: number;
};

export type SourceAnalysis = {
  readonly lines: number;
  readonly functions: AnalysisFunction[];
  readonly classes: AnalysisClass[];
};

type MetricGroup =
  | 'functionLines'
  | 'functionStatements'
  | 'functionControlNesting'
  | 'functionParameters'
  | 'classLines'
  | 'classMembers';

export type Distribution = {
  readonly p50: number | undefined;
  readonly p90: number | undefined;
  readonly p95: number | undefined;
  readonly max: number | undefined;
};

export type ProductionAnalysis = {
  readonly summary: {
    readonly files: number;
    readonly lines: number;
    readonly functions: number;
    readonly classes: number;
  };
  readonly distributions: Readonly<Record<MetricGroup, Distribution>>;
  readonly rankings: Readonly<Record<MetricGroup, readonly Ranked[]>>;
  readonly functions: AnalysisFunction[];
  readonly classes: AnalysisClass[];
};
