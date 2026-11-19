import { RULE_IDS } from '../../../../shared/policy.mjs';
import { featureFactAnalysis as featureFactAnalysisUntyped } from '../../../../shared/rules/facts/evaluate.mjs';
import { PUBLIC_FACES } from '../../../../shared/rules/features/feature-roles.mjs';
import { domainFindings } from '../domain/domain-findings.mts';
import { isGeneratedJvm as isGeneratedJvmUntyped } from '../generated/generated-sources.mts';
import { simpleName as simpleNameUntyped } from '../../ingest/class-names.mts';
import { readClassGraph } from './class-graph.mts';
import { featurePlan, readSpringReports } from './feature-layout.mts';
import { persistenceOf } from './persistence-classes.mts';
import { byText as byTextUntyped } from '../../../../shared/text-order/by-text.mjs';
import { fieldsOf, textsOf } from '../../../../shared/values/readers.mts';
import type { ClassGraph, ResolvedGraph } from '../domain/domain-types.mts';
import type { JavaFinding } from '../typed/java-values.mts';
import type {
  FeatureAnalysis,
  FeatureCycles,
  FeatureFactSet,
  FeatureLayout,
  FeaturePlan,
  GraphOptions,
} from './feature-types.mts';

type FeatureOptions = {
  readonly language: string;
  readonly analyzerName: string;
  readonly policy: { readonly exceptions: unknown; readonly layout: FeatureLayout };
  readonly publicFace: unknown;
  readonly rules: readonly string[];
};
type GraphContext = {
  readonly language: string;
  readonly policy: Readonly<Record<string, unknown>>;
  readonly persistence: ReadonlyMap<string, string | undefined>;
  readonly isGenerated: (file: string) => boolean;
};

const featureFactAnalysis: (facts: FeatureFactSet, options: FeatureOptions) => FeatureAnalysis =
  featureFactAnalysisUntyped;
const isGeneratedJvm: (projectRoot: string, file: string) => boolean = isGeneratedJvmUntyped;
const simpleName: (className: string) => string = simpleNameUntyped;
const byText: (left: string, right: string) => number = byTextUntyped;

const COUPLING_TOOL = 'coupling';
const GRAPH_RULES = [RULE_IDS.featureCycle, RULE_IDS.foreignFeaturePersistence];
const NO_CYCLES: FeatureCycles = {
  explainedCycles: [],
  featureOf: () => undefined,
  generatedFiles: new Set(),
};

export function featureFacts(
  { classes, edges }: Pick<ClassGraph, 'classes' | 'edges'>,
  {
    persistence = new Map<string, string | undefined>(),
    isGenerated = () => false,
  }: Partial<Pick<GraphContext, 'persistence' | 'isGenerated'>> = {},
): FeatureFactSet {
  const imports = new Map<string, { from: string; to: string; names: Set<string> }>();
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

function rootsOf(value: unknown): readonly string[] | undefined {
  return Array.isArray(value) ? textsOf(value) : undefined;
}

function layoutOf(value: unknown): FeatureLayout {
  const sharedRoots = rootsOf(fieldsOf(value)['sharedRoots']);
  const featureRoots = rootsOf(fieldsOf(value)['featureRoots']);
  return {
    ...(sharedRoots === undefined ? {} : { sharedRoots }),
    ...(featureRoots === undefined ? {} : { featureRoots }),
  };
}

function withoutEdges(facts: FeatureFactSet, covered: ReadonlySet<string>): FeatureFactSet {
  return {
    ...facts,
    imports: facts.imports.filter(({ from, to }) => !covered.has(`${from}\0${to}`)),
  };
}

function featureGraphFindings(
  graph: ResolvedGraph,
  plan: FeaturePlan,
  { language, policy, persistence, isGenerated }: GraphContext,
): { findings: JavaFinding[]; cycles: FeatureCycles } {
  const facts = featureFacts(graph, { persistence, isGenerated });
  const options: Omit<FeatureOptions, 'rules'> = {
    language,
    analyzerName: COUPLING_TOOL,
    policy: { exceptions: policy['exceptions'] ?? [], layout: plan.layout },
    publicFace: PUBLIC_FACES.jvm,
  };
  const analysis = featureFactAnalysis(facts, { ...options, rules: GRAPH_RULES });
  const boundaries: Pick<FeatureAnalysis, 'findings'> =
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

export function readFeatureGraph(
  projectRoot: string,
  { projects, kotlin, policy = {} }: GraphOptions,
): { layout: FeatureLayout; findings: JavaFinding[]; cycles: FeatureCycles } {
  const graph = readClassGraph(projectRoot, projects);
  const plan = featurePlan(layoutOf(policy['layout']), readSpringReports(projects), graph);
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
