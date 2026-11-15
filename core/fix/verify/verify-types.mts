import type { Journal } from '../dry-run/journal-types.mts';

export type VerifiableAnalyzer = {
  readonly name: string;
  readonly reportedTools?: readonly string[];
};

export type FindingKey = {
  readonly tool: string;
  readonly rule: string;
  readonly path: string;
};

export type AnalyzedFinding = FindingKey & { readonly classification: string };

export type CountedFinding = FindingKey & { readonly count: number };

export type Counts = ReadonlyMap<string, CountedFinding>;

export type RecipeRun = {
  readonly id: string;
  readonly files: Set<string>;
  readonly findings: FindingKey[];
};

export type AnalyzeRequest = {
  readonly tools: readonly string[];
  readonly files: readonly string[];
  readonly mode: string;
};

type AnalyzeResult = {
  readonly findings: readonly AnalyzedFinding[];
  readonly errors?: readonly string[];
  readonly unmatched?: readonly string[];
};

export type Analyze = (request: AnalyzeRequest) => AnalyzeResult;

export type Analysis = {
  readonly findings: Counts;
  readonly errors: readonly string[];
  readonly unmatched: readonly string[];
};

type RolledBackRun = {
  readonly recipe: string;
  readonly files: readonly string[];
  readonly reasons: readonly string[];
};

export type VerifyResult = {
  readonly rolledBack: readonly RolledBackRun[];
  readonly notes: readonly string[];
};

export type VerifiedAnalyzers = {
  readonly names: string[];
  readonly unmatched: string[];
};

export type Comparison = { readonly before: Counts; readonly after: Counts };

export type Judgement = Comparison & {
  readonly runs: readonly RecipeRun[];
  readonly breaking: (tool: string) => boolean;
};

export type Analyses =
  | { readonly failure: string }
  | { readonly failure?: undefined; readonly after: Analysis; readonly before: Analysis };

export type VerifyRequest = {
  readonly journal: Journal;
  readonly analyze: unknown;
  readonly mode?: string;
};

export function isAnalyze(value: unknown): value is Analyze {
  return typeof value === 'function';
}

export type RunEvent = {
  readonly recipe?: string | undefined;
  readonly files: readonly string[];
  readonly finding?: FindingKey | undefined;
  readonly alsoFindings?: readonly FindingKey[] | undefined;
};
