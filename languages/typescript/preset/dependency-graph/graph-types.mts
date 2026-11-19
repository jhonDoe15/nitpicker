export type GraphDependency = {
  readonly resolved?: string;
  readonly dependencyTypes?: readonly string[];
  readonly preCompilationOnly?: true;
};

export type GraphModule = {
  readonly source: string;
  readonly dependencies?: readonly GraphDependency[];
};

export type DependencyGraph = { readonly modules: readonly GraphModule[] };

export type GraphEdge = {
  readonly source: string;
  readonly target: string;
  readonly kind: 'runtime' | 'type-only';
};

export type GraphImport = { readonly from: string; readonly to: string };
