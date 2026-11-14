export type Span = {
  readonly startLine: number;
  readonly startColumn: number;
  readonly endLine: number;
  readonly endColumn: number;
};

export type Position = { readonly line: number; readonly column: number };

export type StatementUnit = { readonly span: Span; readonly hits: number };

export type BranchUnit = { readonly span: Span; readonly hits: readonly number[] };

export type FunctionEntry = {
  readonly span: Span;
  readonly spanSource: string;
  readonly name?: string;
  readonly declarationStart?: Position;
};

export type Fields = {
  readonly [key: string]: unknown;
  readonly path?: unknown;
  readonly statementMap?: unknown;
  readonly s?: unknown;
  readonly branchMap?: unknown;
  readonly b?: unknown;
  readonly fnMap?: unknown;
  readonly loc?: unknown;
  readonly decl?: unknown;
  readonly line?: unknown;
  readonly locations?: unknown;
  readonly name?: unknown;
  readonly start?: unknown;
  readonly end?: unknown;
  readonly column?: unknown;
};

export type ResolvedSpan = Pick<FunctionEntry, 'span' | 'spanSource'>;

export type FileCoverage = {
  readonly statements: readonly StatementUnit[];
  readonly branches: readonly BranchUnit[];
  readonly functions: readonly FunctionEntry[];
};

export type CoverageMetric = {
  readonly percent: number | undefined;
  readonly status: string;
  readonly unknownReason: string | undefined;
};

export type MethodCoverage = {
  readonly coverage: CoverageMetric;
  readonly statementCoverage: CoverageMetric;
  readonly branchCoverage: CoverageMetric;
};

export type FunctionDescriptor = {
  readonly functionName: string;
  readonly containerName: string | undefined;
  readonly displayName: string;
  readonly startLine: number;
  readonly endLine: number;
  readonly complexity: number;
  readonly bodySpan: Span;
  readonly expectsStatementCoverage: boolean;
  readonly expectsBranchCoverage: boolean;
};

export type FunctionMetric = FunctionDescriptor &
  MethodCoverage & {
    readonly relativePath: string;
    readonly location: string;
    readonly crapScore: number | undefined;
  };

export type ReportEntry = {
  readonly source: string;
  readonly function: string;
  readonly lines: { readonly start: number; readonly end: number };
  readonly complexity: number;
  readonly statementCoverage: CoverageMetric;
  readonly branchCoverage: CoverageMetric;
  readonly effectiveCoverage: CoverageMetric;
  readonly crap: number | undefined;
};
