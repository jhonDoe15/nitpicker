import { RULE_IDS } from '../../../../shared/policy.mjs';
import { featureFactAnalysis } from '../../../../shared/rules/facts/evaluate.mjs';
import { PUBLIC_FACES } from '../../../../shared/rules/features/feature-roles.mjs';
import { simpleName } from './class-graph.mjs';
import { featurePlan } from './feature-layout.mjs';
import { packageCycleFindings } from './package-cycles.mjs';

const COUPLING_TOOL = 'coupling';
const GRAPH_RULES = [
  RULE_IDS.featureCycle,
  RULE_IDS.sharedUsedByOneFeature,
  RULE_IDS.foreignFeaturePersistence,
];
const BOUNDARY_RULES = [RULE_IDS.featureInternalImport, RULE_IDS.sharedImportsFeature];

export function featureFacts(
  { classes, edges },
  { persistence = new Map(), isGenerated = () => false } = {},
) {
  const imports = new Map();
  for (const { source, target } of edges.filter((edge) => edge.source.file !== edge.target.file)) {
    const key = `${source.file}\0${target.file}`;
    const entry = imports.get(key) ?? { from: source.file, to: target.file, names: new Set() };
    entry.names.add(simpleName(target.name));
    imports.set(key, entry);
  }
  return {
    modules: [...new Set(classes.map(({ file }) => file))].sort().map((file) => ({
      file,
      role: 'production',
      generated: isGenerated(file),
      ...(persistence.has(file) ? { persistence: persistence.get(file) } : {}),
    })),
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

export function featureGraphFindings(graph, { language, policy, reports, ...classes }) {
  const facts = featureFacts(graph, classes);
  const plan = featurePlan(policy.layout ?? {}, reports, graph);
  const options = {
    language,
    analyzerName: COUPLING_TOOL,
    policy: { exceptions: policy.exceptions ?? [], layout: plan.layout },
    publicFace: PUBLIC_FACES.jvm,
  };
  const analysis = featureFactAnalysis(facts, { ...options, rules: GRAPH_RULES });
  const boundaries = plan.boundaries
    ? featureFactAnalysis(withoutEdges(facts, plan.covered), { ...options, rules: BOUNDARY_RULES })
    : { findings: [] };
  return [...analysis.findings, ...boundaries.findings, ...packageCycleFindings(graph, analysis)];
}
