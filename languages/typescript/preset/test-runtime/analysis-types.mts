export type AnalysisLayout = {
  readonly sourceRoot: string;
  readonly sourceRoots: readonly string[];
  readonly graphRoots: readonly string[];
  readonly testRoots: readonly string[];
  readonly entryExtensions: readonly string[];
  isExcluded(source: string): boolean;
  isEndToEndTest(source: string): boolean;
  isRunnerTestFile(source: string): boolean;
  isSourceUnderRoot(source: string, root: string): boolean;
};

export type GraphDependency = {
  readonly module?: string;
  readonly resolved?: string;
  readonly dynamic?: unknown;
  readonly preCompilationOnly?: unknown;
  readonly dependencyTypes?: readonly string[];
};

export type GraphModule = {
  readonly source: string;
  readonly dependencies?: readonly GraphDependency[];
};

export type Graph = { readonly modules?: readonly GraphModule[] | undefined };

export type Edge = {
  readonly target: string;
  readonly kind: 'runtime' | 'type-only';
  readonly dynamic: boolean;
};

export type TestClassification = {
  readonly test: string;
  readonly category: string;
  readonly directProductionModules: string[];
  readonly runtimeProductionModules: string[];
  readonly typeOnlyProductionModules: string[];
  readonly subprocessBridges: string[];
};

export type RuntimeReport = {
  readonly summary: Readonly<Record<string, unknown>>;
  readonly exclusions: string[];
  readonly tests: TestClassification[];
  readonly findings: TestClassification[];
};

export type AnalyzeOptions = {
  readonly layout?: AnalysisLayout;
  readonly productionRoots?: readonly string[];
  readonly sourceTexts?: ReadonlyMap<string, string>;
  readonly subprocessBridges?: readonly string[];
};
