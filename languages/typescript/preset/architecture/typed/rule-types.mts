export type PathPattern = string | string[];

export type NonProjectDependency =
  | 'core'
  | 'npm'
  | 'npm-dev'
  | 'npm-optional'
  | 'npm-peer'
  | 'npm-bundled'
  | 'npm-no-pkg'
  | 'npm-unknown'
  | 'unknown'
  | 'undetermined';

type RuleSide = {
  readonly path?: PathPattern;
  readonly pathNot?: PathPattern;
  readonly dependencyTypes?: 'core'[];
  readonly reachable?: true;
};

export type BoundaryRule = {
  readonly name: string;
  readonly severity: 'error';
  readonly comment: string;
  readonly from: RuleSide;
  readonly to: RuleSide;
};

export type BoundaryException = {
  readonly rule: string;
  readonly paths: readonly string[];
};

export type ReachModule = {
  readonly source: string;
  readonly dependencies?: readonly {
    readonly resolved: string;
    readonly dependencyTypes?: readonly string[];
    readonly preCompilationOnly?: true;
  }[];
};

export type ReachViolation = { readonly from: string; readonly to: string };

export type TestPathLayout = {
  readonly sourceRoots: readonly string[];
  readonly testRoots: readonly string[];
  projectCodeFiles(projectRoot: string, roots: readonly string[]): readonly string[];
  isTestFile(file: string): boolean;
  isTestPath(file: string): boolean;
};

export type LayoutFeatures = {
  readonly featureRoot: string;
  readonly feature: string;
  readonly shared: string;
  readonly compositionRoot: string;
};
