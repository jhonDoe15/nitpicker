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

export function featureCycleEdges({ imports }, roleOf) {
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

function featureName(directory) {
  return directory.split('/').at(-1);
}

export function featureCycleFindings(facts, context) {
  const rule = RULE_IDS.featureCycle;
  const entries = groupedByImporter(
    featureCycleEdges(facts, context.roleOf).map(({ from, to, source, target, cycle }) => ({
      importer: from,
      target: to,
      source,
      feature: target,
      cycle,
    })),
  );
  return sortedBy(entries, ({ importer, feature }) => `${importer}\0${feature.directory}`).flatMap(
    ({ importer, source, feature, targets, cycle }) =>
      featureFinding(
        rule,
        {
          importer,
          identity: `${feature.directory}|${rule}`,
          message: 'featureCycle',
          values: {
            importer,
            source: source.name,
            feature: feature.name,
            targets: listed(targets),
            cycle: listed(cycle.map((directory) => featureName(directory))),
          },
        },
        context,
      ),
  );
}
