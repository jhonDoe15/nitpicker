import type { GraphEdge } from '../dependency-graph/graph-types.mts';

export type AnalysisLayout = {
  readonly entryExtensions: readonly string[];
  readonly javascript: boolean;
  readonly sourceRoots: readonly string[];
  isSourceUnderRoot(file: string, root: string): boolean;
};

export type BoundaryFinding = {
  readonly source: string;
  readonly target: string;
  readonly sourceComponent: string;
  readonly targetComponent: string;
  readonly dependencyKind: GraphEdge['kind'];
};

type PublicBoundaryFinding = BoundaryFinding & { readonly publicEntryPoint: string };

export type BoundaryGroups = {
  throughEntryPoint: BoundaryFinding[];
  publicAlternativeBypasses: PublicBoundaryFinding[];
  unexportedTargetImports: PublicBoundaryFinding[];
  missingEntryPointImports: BoundaryFinding[];
  concreteCrossBoundaryImports: BoundaryFinding[];
};

export type ScopeOptions = {
  readonly layout: AnalysisLayout;
  readonly foundationDirectories: ReadonlySet<string>;
  readonly compositionRoots: ReadonlySet<string>;
};

export type EntryPointScope = ScopeOptions & {
  readonly graph: unknown;
  readonly root: string;
  readonly productionModules: readonly string[];
  readonly components: ReadonlySet<string>;
  readonly entryPoints: ReadonlyMap<string, string>;
  readonly isExportReachable: (entryPoint: string, target: string) => boolean;
};

export type EntryPointAnalysis = BoundaryGroups & {
  readonly summary: {
    readonly productionModules: number;
    readonly components: number;
    readonly declaredEntryPoints: number;
    readonly [counted: string]: number;
  };
  readonly components: string[];
};
