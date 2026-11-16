export type CouplingEdge = { readonly source: string; readonly target: string };

export type FeatureRole = {
  readonly kind: string;
  readonly directory: string;
  readonly [field: string]: unknown;
};

export type CouplingFeatures = {
  readonly classFiles?: ReadonlyMap<string, string> | undefined;
  readonly generatedFiles: ReadonlySet<string>;
};

export type KotlinModules = {
  readonly fileOf: ReadonlyMap<string, string>;
  readonly moduleOf: ReadonlyMap<string, string>;
};

export type CouplingOptions = {
  readonly classes: readonly string[];
  readonly edges: readonly CouplingEdge[];
  readonly fileOf: (className: string) => string;
  readonly moduleOf?: (className: string) => string;
  readonly layout?: unknown;
};

export type CouplingProject = {
  readonly projectRoot: string;
  readonly sourceRoots: readonly string[];
  readonly kotlin?: KotlinModules | undefined;
  readonly files?: ReadonlyMap<string, string | undefined> | undefined;
  readonly layout?: unknown;
  readonly features?: CouplingFeatures | undefined;
};

type CouplingModule = {
  readonly file: string;
  readonly fanIn: number;
  readonly fanOut: number;
  readonly totalCoupling: number;
  readonly instability: number;
};

type CouplingPackage = { readonly name: string; readonly [field: string]: unknown };

type StabilityViolation = { readonly source: string; readonly target: string };

export type CouplingReport = {
  readonly summary: unknown;
  readonly modules: readonly CouplingModule[];
  readonly packages: readonly CouplingPackage[];
  readonly stabilityDirection: readonly StabilityViolation[];
};
