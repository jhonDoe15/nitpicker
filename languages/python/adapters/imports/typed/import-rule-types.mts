import type {
  ImportEdge,
  ImportStatement,
  PythonModule,
} from '../../analysis/typed/python-graph-types.mts';

export type ModuleIndex = ReadonlyMap<string, PythonModule>;

export type PackageEdge = {
  readonly source: string;
  readonly target: string;
  readonly files: string;
};

export type FeatureView = {
  readonly explainedCycles: readonly unknown[];
  readonly featureOf: (file: string) => string | undefined;
};

export function entryOf(byName: ModuleIndex, name: string): PythonModule {
  const entry = byName.get(name);
  if (entry === undefined) {
    throw new TypeError(`Unknown Python module ${name}`);
  }
  return entry;
}

export type ImportEdges = (
  modules: readonly PythonModule[],
  imports: Readonly<Record<string, readonly ImportStatement[]>>,
) => ImportEdge[];

export type StronglyConnected = (
  nodes: readonly string[],
  edges: readonly { readonly source: string; readonly target: string }[],
) => string[][];
