export type Counts = { readonly covered: number; readonly total: number };

export type CoverageUnit = {
  readonly name: string;
  readonly className: string;
  readonly line: number;
  readonly lines: Counts;
  readonly branches: Counts;
  readonly constructorTypes?: readonly string[] | undefined;
};

export type FunctionUnit = {
  readonly ccn: number;
  readonly file: string;
  readonly name: string;
  readonly longName: string;
  readonly start: number;
  readonly end: number;
  readonly signature?: string;
  readonly parameterTypes?: unknown;
  readonly lambda: boolean;
  readonly lineScoped: boolean;
  readonly lineFallback: boolean;
  readonly numberedAmongSameSource: boolean;
};

export type SelectMethods = (
  fn: FunctionUnit,
  candidates: readonly CoverageUnit[],
  siblings: readonly FunctionUnit[],
) => CoverageUnit[];

export type CoveragePools = {
  readonly methods: ReadonlyMap<string, readonly CoverageUnit[]>;
  readonly lines: ReadonlyMap<string, readonly CoverageUnit[]>;
};

export type CoverageRequest = {
  readonly pools: CoveragePools;
  readonly keysOf: (filePath: string) => readonly string[];
  readonly selectMethods: SelectMethods;
  readonly parsed: readonly FunctionUnit[];
};
