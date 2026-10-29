import { RULE_IDS } from '../../../../shared/policy.mjs';
import { featureFactAnalysis } from '../../../../shared/rules/facts/evaluate.mjs';
import { PUBLIC_FACES } from '../../../../shared/rules/features/feature-roles.mjs';
import { isGeneratedJvm } from '../generated/generated-sources.mjs';
import { readClassGraph } from './class-graph.mjs';
import { featurePlan, readSpringReports } from './feature-layout.mjs';
import { packageCycleFindings } from './package-cycles.mjs';

const COUPLING_TOOL = 'coupling';
const GRAPH_RULES = [RULE_IDS.featureCycle, RULE_IDS.sharedUsedByOneFeature];

function simpleName(className) {
  return className.slice(className.lastIndexOf('.') + 1);
}

export function featureFacts({ classes, edges }, isGenerated = () => false) {
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
      .map((file) => ({ file, role: 'production', generated: isGenerated(file) })),
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

function handwritten({ classes, edges }, isGenerated) {
  const generated = new Set(classes.map(({ file }) => file).filter(isGenerated));
  return {
    classes: classes.filter(({ file }) => !generated.has(file)),
    edges: edges.filter(
      ({ source, target }) => !generated.has(source.file) && !generated.has(target.file),
    ),
  };
}

function featureGraphFindings(graph, plan, { language, policy, isGenerated }) {
  const facts = featureFacts(graph, isGenerated);
  const options = {
    language,
    analyzerName: COUPLING_TOOL,
    policy: { exceptions: policy.exceptions ?? [], layout: plan.layout },
    publicFace: PUBLIC_FACES.jvm,
  };
  const analysis = featureFactAnalysis(facts, { ...options, rules: GRAPH_RULES });
  const boundaries =
    plan.boundaryRules.length === 0
      ? { findings: [] }
      : featureFactAnalysis(withoutEdges(facts, plan.covered), {
          ...options,
          rules: plan.boundaryRules,
        });
  return [
    ...analysis.findings,
    ...boundaries.findings,
    ...packageCycleFindings(handwritten(graph, isGenerated), analysis),
  ];
}

export function readFeatureGraph(projectRoot, { projects, kotlin, policy = {} }) {
  const graph = readClassGraph(projectRoot, projects);
  const plan = featurePlan(policy.layout ?? {}, readSpringReports(projects), graph);
  return {
    layout: plan.layout,
    findings:
      graph.classes.length === 0
        ? []
        : featureGraphFindings(graph, plan, {
            language: kotlin ? 'kotlin' : 'java',
            policy,
            isGenerated: (file) => isGeneratedJvm(projectRoot, file),
          }),
  };
}
