import { stronglyConnected } from '../../graph/strongly-connected.mjs';
import { RULE_IDS } from '../../policy.mjs';
import {
  featureFinding,
  groupedByImporter,
  listed,
  productionImports,
  sortedBy,
} from './feature-boundaries.mjs';

function crossFeatureEdges(imports, roleOf) {
  return productionImports(imports)
    .filter(({ typeOnly }) => typeOnly !== true)
    .map(({ from, to }) => ({ from, to, source: roleOf(from), target: roleOf(to) }))
    .filter(
      ({ source, target }) =>
        source.kind === 'feature' &&
        target.kind === 'feature' &&
        source.directory !== target.directory,
    );
}

function featureCycleEdges({ imports }, roleOf) {
  const edges = crossFeatureEdges(imports, roleOf);
  const directories = edges.flatMap(({ source, target }) => [source.directory, target.directory]);
  const components = stronglyConnected(
    [...new Set(directories)],
    edges.map(({ source, target }) => ({ source: source.directory, target: target.directory })),
  );
  const componentOf = new Map(
    components.flatMap((members) => members.map((member) => [member, members])),
  );
  return edges
    .filter(({ source, target }) => componentOf.get(source.directory)?.includes(target.directory))
    .map((edge) => ({ ...edge, cycle: componentOf.get(edge.source.directory) }));
}

function featureNames(edges) {
  return new Map(
    edges.flatMap(({ source, target }) => [
      [source.directory, source.name],
      [target.directory, target.name],
    ]),
  );
}

function cycleFinding(entry, { names, context }) {
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
        cycle: listed(cycle.map((directory) => names.get(directory))),
      },
    },
    context,
  );
}

function explainedCycles(reported, edges) {
  const cycles = new Map(reported.map(({ cycle }) => [cycle.join('\0'), cycle]));
  return [...cycles.values()].map((features) => ({
    features,
    edges: edges.filter(({ cycle }) => cycle === features).map(({ from, to }) => ({ from, to })),
  }));
}

export function featureCycleAnalysis(facts, context) {
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

export function featureCycleFindings(facts, context) {
  return featureCycleAnalysis(facts, context).findings;
}
