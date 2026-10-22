import { RULE_IDS } from '../../../../shared/policy.mjs';
import { sharedFactFindings } from '../../../../shared/rules/facts/evaluate.mjs';
import { featureCycleEdges } from '../../../../shared/rules/features/feature-cycles.mjs';
import {
  featureLayout,
  featureRoles,
  PUBLIC_FACES,
} from '../../../../shared/rules/features/feature-roles.mjs';
import { readClassGraph } from './class-graph.mjs';
import { featurePlan, readSpringReports } from './feature-layout.mjs';
import { packageCycleFindings } from './package-cycles.mjs';

const COUPLING_TOOL = 'coupling';
const GRAPH_RULES = [RULE_IDS.featureCycle, RULE_IDS.sharedUsedByOneFeature];
const BOUNDARY_RULES = [RULE_IDS.featureInternalImport, RULE_IDS.sharedImportsFeature];

function simpleName(className) {
  return className.slice(className.lastIndexOf('.') + 1);
}

export function featureFacts({ classes, edges }) {
  const imports = new Map();
  for (const { source, target } of edges.filter((edge) => edge.source.file !== edge.target.file)) {
    const key = `${source.file}\0${target.file}`;
    const entry = imports.get(key) ?? { from: source.file, to: target.file, names: new Set() };
    entry.names.add(simpleName(target.name));
    imports.set(key, entry);
  }
  return {
    modules: [...new Set(classes.map(({ file }) => file))]
      .sort()
      .map((file) => ({ file, role: 'production' })),
    imports: [...imports.values()].map((entry) => ({
      ...entry,
      names: [...entry.names].sort().map((name) => ({ name })),
    })),
  };
}

function withoutEdges(facts, covered) {
  return {
    ...facts,
    imports: facts.imports.filter(({ from, to }) => !covered.has(`${from}\0${to}`)),
  };
}

function reportedEdges(facts, layout) {
  const roleOf = featureRoles(featureLayout(layout));
  const sharedToFeature = facts.imports.filter(
    ({ from, to }) => roleOf(from).kind === 'shared' && roleOf(to).kind === 'feature',
  );
  return new Set(
    [...featureCycleEdges(facts, roleOf), ...sharedToFeature].map(
      ({ from, to }) => `${from}\0${to}`,
    ),
  );
}

export function featureGraphFindings(graph, { language, policy, reports }) {
  const facts = featureFacts(graph);
  const plan = featurePlan(policy.layout ?? {}, reports, graph);
  const options = {
    language,
    analyzerName: COUPLING_TOOL,
    policy: { exceptions: policy.exceptions ?? [], layout: plan.layout },
    publicFace: PUBLIC_FACES.jvm,
  };
  return [
    ...sharedFactFindings(facts, { ...options, rules: GRAPH_RULES }),
    ...(plan.boundaries
      ? sharedFactFindings(withoutEdges(facts, plan.covered), { ...options, rules: BOUNDARY_RULES })
      : []),
    ...packageCycleFindings(graph, reportedEdges(facts, plan.layout)),
  ];
}

export function readFeatureGraphFindings(projectRoot, { projects, kotlin, policy = {} }) {
  const graph = readClassGraph(projectRoot, projects);
  return graph.classes.length === 0
    ? []
    : featureGraphFindings(graph, {
        language: kotlin ? 'kotlin' : 'java',
        policy,
        reports: readSpringReports(projects),
      });
}
