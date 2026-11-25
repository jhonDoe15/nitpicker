import type { ExplainedCycle } from '../../graph/explained-cycles.mts';
import { stronglyConnected } from '../../graph/strongly-connected.mts';
import { RULE_IDS } from '../../policy.mts';
import type { Finding } from '../../values/findings.mts';
import type { FactImport } from '../facts/typed/fact-types.mts';
import { isFeatureSide } from './feature-roles.mts';
import type { FeatureContext, FeatureSide, RoleOf } from './typed/role-types.mts';
import {
  featureFinding,
  groupedByImporter,
  listed,
  productionImports,
  sortedBy,
} from './feature-boundaries.mts';

type CycleImport = Pick<FactImport, 'from' | 'to' | 'typeOnly' | 'role'>;

type CycleFacts = { readonly imports: readonly CycleImport[] };

type CrossEdge = {
  readonly from: string;
  readonly to: string;
  readonly source: FeatureSide;
  readonly target: FeatureSide;
};

type CycleEdge = CrossEdge & { readonly cycle: string[] };

function crossFeatureEdges(imports: readonly CycleImport[], roleOf: RoleOf): CrossEdge[] {
  return productionImports(imports)
    .filter(({ typeOnly }) => typeOnly !== true)
    .flatMap(({ from, to }) => {
      const [source, target] = [roleOf(from), roleOf(to)];
      return isFeatureSide(source) && isFeatureSide(target) && source.directory !== target.directory
        ? [{ from, to, source, target }]
        : [];
    });
}

function featureCycleEdges({ imports }: CycleFacts, roleOf: RoleOf): CycleEdge[] {
  const edges = crossFeatureEdges(imports, roleOf);
  const directories = edges.flatMap(({ source, target }) => [source.directory, target.directory]);
  const components = stronglyConnected(
    [...new Set(directories)],
    edges.map(({ source, target }) => ({ source: source.directory, target: target.directory })),
  );
  const componentOf = new Map(
    components.flatMap((members) => members.map((member): [string, string[]] => [member, members])),
  );
  return edges.flatMap((edge) => {
    const cycle = componentOf.get(edge.source.directory);
    return cycle !== undefined && cycle.includes(edge.target.directory) ? [{ ...edge, cycle }] : [];
  });
}

function featureNames(edges: readonly CrossEdge[]): Map<string, string> {
  return new Map(
    edges.flatMap(({ source, target }): [string, string][] => [
      [source.directory, source.name],
      [target.directory, target.name],
    ]),
  );
}

type CycleEntry = {
  readonly importer: string;
  readonly source: FeatureSide;
  readonly feature: FeatureSide;
  readonly targets: string[];
  readonly cycle: string[];
};

function cycleFinding(
  entry: CycleEntry,
  {
    names,
    context,
  }: { readonly names: ReadonlyMap<string, string>; readonly context: FeatureContext },
): Finding[] {
  const { importer, source, feature, targets, cycle } = entry;
  return featureFinding(
    RULE_IDS.featureCycle,
    {
      importer,
      identity: `${feature.directory}|${RULE_IDS.featureCycle}`,
      message: 'featureCycle',
      values: {
        importer,
        source: source.name,
        feature: feature.name,
        targets: listed(targets),
        cycle: listed(cycle.map((directory) => names.get(directory) ?? '')),
      },
    },
    context,
  );
}

function explainedCycles(
  reported: readonly CycleEntry[],
  edges: readonly CycleEdge[],
): ExplainedCycle[] {
  const cycles = new Map(reported.map(({ cycle }) => [cycle.join('\0'), cycle]));
  return [...cycles.values()].map((features) => ({
    features,
    edges: edges.filter(({ cycle }) => cycle === features).map(({ from, to }) => ({ from, to })),
  }));
}

export function featureCycleAnalysis(
  facts: CycleFacts,
  context: FeatureContext,
): { readonly findings: Finding[]; readonly cycles: ExplainedCycle[] } {
  const edges = featureCycleEdges(facts, context.roleOf);
  const names = featureNames(edges);
  const entries = sortedBy(
    groupedByImporter(
      edges.map(({ from, to, source, target, cycle }) => ({
        importer: from,
        target: to,
        source,
        feature: target,
        cycle,
      })),
    ),
    ({ importer, feature }) => `${importer}\0${feature.directory}`,
  ).map((entry) => ({ entry, findings: cycleFinding(entry, { names, context }) }));
  const reported = entries.filter(({ findings }) => findings.length > 0);
  return {
    findings: entries.flatMap(({ findings }) => findings),
    cycles: explainedCycles(
      reported.map(({ entry }) => entry),
      edges,
    ),
  };
}

export function featureCycleFindings(facts: CycleFacts, context: FeatureContext): Finding[] {
  return featureCycleAnalysis(facts, context).findings;
}
