import type { GraphEdge } from '../../dependency-graph/graph-types.mts';

type FeatureRole = {
  readonly kind: string;
  readonly directory?: string;
  readonly name?: string;
  readonly folder?: string;
  readonly face?: string;
};

export type RoleOf = (file: string) => FeatureRole;

export type PublicFace = {
  readonly isPublic: (name: string) => boolean;
  readonly describe: (directory: string) => string;
};

export type FeatureLayoutInput = {
  readonly sharedRoots: readonly string[];
  readonly featureRoots: readonly string[];
  readonly sharedInsideFeatures: boolean;
};

export type Matcher = { test(value: string): boolean };

export type CouplingLayout = {
  isSourceFile(file: string): boolean;
  isSourceUnderRoot(file: string, root: string): boolean;
};

export type ModuleMetric = {
  readonly module: string;
  readonly package: string;
  readonly fanIn: number;
  readonly fanOut: number;
  readonly totalCoupling: number;
  readonly instability: unknown;
  readonly runtimeFanIn?: number;
  readonly runtimeFanOut?: number;
  readonly runtimeInstability?: unknown;
};

export type PackageMetric = {
  readonly name: string;
  readonly modules: number;
  readonly fanIn: number;
  readonly fanOut: number;
  readonly instability: unknown;
  readonly cohesion: {
    readonly internalEdges: number;
    readonly edgeDensity: unknown;
    readonly connectedComponents: number;
    readonly largestComponentShare: unknown;
  };
};

type StabilityDirection = {
  readonly source: string;
  readonly target: string;
  readonly sourceInstability: number;
  readonly targetInstability: number;
  readonly delta: number;
  readonly cause: { readonly folders: readonly string[] };
  readonly path?: string;
  readonly message?: string;
};

export type CouplingMetrics = {
  readonly modules: readonly ModuleMetric[];
  readonly packages: readonly PackageMetric[];
  readonly stabilityDirection: readonly StabilityDirection[];
};

export type CouplingInput = {
  readonly modules: readonly string[];
  readonly edges: readonly GraphEdge[];
  readonly packageOf: (file: string) => string;
  readonly runtime: boolean;
  readonly fileOf: (file: string) => string;
  readonly groupOf: (file: string) => string;
  readonly roleOf: RoleOf;
  readonly groupNoun: string;
};

export type SharedImport = {
  readonly from: string;
  readonly to: string;
  readonly role: 'production' | 'test';
};

export type SharedEntry = {
  readonly source: string;
  readonly feature: string;
  readonly directory: string;
};
