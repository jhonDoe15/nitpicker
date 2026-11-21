import { stronglyConnected } from './strongly-connected.mts';

type PackagedEdge = { readonly source: string; readonly target: string; readonly files: string };

export type ExplainedCycle = {
  readonly features: readonly string[];
  readonly edges: readonly { readonly from: string; readonly to: string }[];
};

type CycleContext = {
  readonly packaged: readonly PackagedEdge[];
  readonly anchor: ReadonlyMap<string, string>;
  readonly features: {
    readonly explainedCycles: readonly ExplainedCycle[];
    featureOf(file: string | undefined): string | undefined;
  };
};

function staysCyclic(
  members: readonly string[],
  packaged: readonly PackagedEdge[],
  cycleEdges: ExplainedCycle['edges'],
): boolean {
  const inside = new Set(members);
  const removed = new Set(cycleEdges.map(({ from, to }) => `${from}\0${to}`));
  const rest = packaged.filter(
    ({ source, target, files }) => inside.has(source) && inside.has(target) && !removed.has(files),
  );
  return stronglyConnected(members, rest).length > 0;
}

export function isExplainedCycle(
  members: readonly string[],
  { packaged, anchor, features }: CycleContext,
): boolean {
  const directories = members.map((member) => features.featureOf(anchor.get(member)));
  if (directories.includes(undefined) || new Set(directories).size < 2) {
    return false;
  }
  return features.explainedCycles.some(
    (cycle) =>
      directories.every(
        (directory) => directory !== undefined && cycle.features.includes(directory),
      ) && !staysCyclic(members, packaged, cycle.edges),
  );
}
