export function isFileTable(value: unknown): value is Readonly<Record<string, CoverageFileData>> {
  return typeof value === 'object' && value !== null;
}

export const parseFunctionEntries: (text: string) => PythonFunctionEntry[] = JSON.parse;

export type Roots = readonly (string | undefined)[];
export type Arc = readonly [number, number];

export type CoverageSummary = {
  readonly covered_lines?: number;
  readonly num_statements?: number;
  readonly covered_branches?: number;
  readonly num_branches?: number;
};

export type CoverageFunctionData = {
  readonly executed_lines?: readonly number[];
  readonly missing_lines?: readonly number[];
  readonly excluded_lines?: readonly number[];
  readonly summary?: CoverageSummary;
};

export type CoverageFileData = {
  readonly executed_lines?: readonly number[];
  readonly missing_lines?: readonly number[];
  readonly executed_branches?: readonly Arc[];
  readonly missing_branches?: readonly Arc[];
  readonly functions?: Readonly<Record<string, CoverageFunctionData>>;
  readonly summary?: CoverageSummary;
};

export type PythonFunctionEntry = {
  readonly file: string;
  readonly name: string;
  readonly start?: number;
  readonly definition: number;
  readonly bodyStart: number;
  readonly end: number;
  readonly complexity: number;
  readonly lambda?: true;
  readonly overload?: true;
  readonly statementLine?: number;
};

export type CrapOptions = {
  readonly roots?: Roots;
  readonly root?: string;
  readonly tool?: string;
  readonly limit?: number;
  readonly unknownMessage?: string;
  readonly sourceText?: (range: { file: string; start: number; end: number }) => string | undefined;
};

export type ScoredFunction = {
  readonly ccn: number;
  readonly file: string;
  readonly name: string;
  readonly start: number;
  readonly end: number;
  readonly lambda: boolean;
  readonly statementLine: number | undefined;
  readonly numberedAmongSameSource: true;
};

export type FunctionCoverage = {
  readonly name: string;
  readonly first: number | undefined;
  readonly last: number | undefined;
  readonly percent: number;
};

export type LineCoverage = {
  readonly executed: readonly number[];
  readonly missing: readonly number[];
  readonly executedBranches: readonly Arc[];
  readonly missingBranches: readonly Arc[];
};

export type FileCoverage = {
  readonly functions: readonly FunctionCoverage[];
  readonly lines: LineCoverage;
};
