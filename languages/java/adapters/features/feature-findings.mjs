import { RULE_IDS } from '../../../../shared/policy.mjs';
import { featureFactAnalysis } from '../../../../shared/rules/facts/evaluate.mjs';
import { PUBLIC_FACES } from '../../../../shared/rules/features/feature-roles.mjs';
import { domainFindings } from '../domain/domain-findings.mjs';
import { isGeneratedJvm } from '../generated/generated-sources.mjs';
import { simpleName } from '../../ingest/class-names.mjs';
import { readClassGraph } from './class-graph.mjs';
import { featurePlan, readSpringReports } from './feature-layout.mjs';
import { persistenceOf } from './persistence-classes.mjs';
import { byText } from '../../../../shared/text-order/by-text.mjs';

const COUPLING_TOOL = 'coupling';
const GRAPH_RULES = [RULE_IDS.featureCycle, RULE_IDS.foreignFeaturePersistence];
const NO_CYCLES = { explainedCycles: [], featureOf: () => undefined, generatedFiles: new Set() };

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
    modules: [...new Set(classes.map(({ file }) => file))].toSorted(byText).map((file) => ({
      file,
      role: 'production',
      generated: isGenerated(file),
      ...(persistence.has(file) ? { persistence: persistence.get(file) } : {}),
    })),
    imports: [...imports.values()].map((entry) => ({
      ...entry,
      names: [...entry.names].toSorted(byText).map((name) => ({ name })),
    })),
  };
}

function withoutEdges(facts, covered) {
  return {
    ...facts,
    imports: facts.imports.filter(({ from, to }) => !covered.has(`${from}\0${to}`)),
  };
}

function featureGraphFindings(graph, plan, { language, policy, persistence, isGenerated }) {
  const facts = featureFacts(graph, { persistence, isGenerated });
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
  const generatedFiles = new Set(
    facts.modules.map(({ file }) => file).filter((file) => isGenerated(file)),
  );
  return {
    findings: [...analysis.findings, ...boundaries.findings],
    cycles: {
      explainedCycles: analysis.explainedCycles,
      featureOf: analysis.featureOf,
      generatedFiles,
    },
  };
}

export function readFeatureGraph(projectRoot, { projects, kotlin, policy = {} }) {
  const graph = readClassGraph(projectRoot, projects);
  const plan = featurePlan(policy.layout ?? {}, readSpringReports(projects), graph);
  if (graph.classes.length === 0) {
    return { layout: plan.layout, findings: [], cycles: NO_CYCLES };
  }
  const features = featureGraphFindings(graph, plan, {
    language: kotlin ? 'kotlin' : 'java',
    policy,
    persistence: persistenceOf(graph, projectRoot),
    isGenerated: (file) => isGeneratedJvm(projectRoot, file),
  });
  return {
    layout: plan.layout,
    findings: [
      ...features.findings,
      ...domainFindings(graph, { projectRoot }).filter(
        ({ path: file }) => !isGeneratedJvm(projectRoot, file),
      ),
    ],
    cycles: { ...features.cycles, classes: graph.classes },
  };
}
