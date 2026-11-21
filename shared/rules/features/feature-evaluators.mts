import { objectOf } from '../../values/readers.mts';
import type { EvaluatorInput, EvaluatorOptions } from '../facts/typed/evaluate-types.mts';
import type { FactImport, FactModule, Facts, RuleContext } from '../facts/typed/fact-types.mts';
import type { Finding } from '../../values/findings.mts';
import {
  featureInternalImportFindings,
  sharedImportsFeatureFindings,
} from './feature-boundaries.mts';
import { featureCycleFindings } from './feature-cycles.mts';
import { featureLayout, featureRoleContract, featureRoles } from './feature-roles.mts';
import { foreignPersistenceFindings } from './foreign-persistence.mts';
import { sharedUsageFindings, sharedUsedByOneFeature } from './shared-usage.mts';
import type { FeatureContext, RoleOf } from './typed/role-types.mts';

export type GraphFacts = {
  readonly modules: readonly FactModule[];
  readonly imports: readonly FactImport[];
};

function sharedUsageSubjects(modules: readonly FactModule[]): string[] {
  return modules
    .filter(({ role, generated, initializer }) => role !== 'test' && !generated && !initializer)
    .map(({ file }) => file);
}

export function withoutGenerated<Facts extends GraphFacts>(facts: Facts): Facts {
  const generated = new Set(
    facts.modules.filter((module) => module.generated).map(({ file }) => file),
  );
  return {
    ...facts,
    imports: facts.imports.filter(({ from, to }) => !(generated.has(from) || generated.has(to))),
  };
}

export function featureContext(
  context: RuleContext,
  options: Pick<EvaluatorOptions, 'policy' | 'publicFace'>,
): FeatureContext {
  const roleOf = featureRoleContract(options.policy.layout, options.publicFace);
  return { ...context, roleOf };
}

export function moduleGraph(facts: Facts): GraphFacts {
  return { ...facts, modules: facts.modules ?? [], imports: facts.imports ?? [] };
}

function featureBoundaryRule(
  findings: (facts: GraphFacts, context: FeatureContext) => Finding[],
): (input: EvaluatorInput) => Finding[] {
  return (input) =>
    findings(
      withoutGenerated(moduleGraph(input.facts)),
      featureContext(input.context, input.options),
    );
}

export function layoutRoles(options: Pick<EvaluatorOptions, 'policy'>): RoleOf {
  return featureRoles(featureLayout(objectOf(options.policy.layout)));
}

export const FEATURE_EVALUATORS: Readonly<Record<string, (input: EvaluatorInput) => Finding[]>> = {
  'shared-used-by-one-feature': (input) =>
    sharedUsageFindings(
      sharedUsedByOneFeature(
        {
          modules: sharedUsageSubjects(moduleGraph(input.facts).modules),
          imports: withoutGenerated(moduleGraph(input.facts)).imports,
        },
        { roleOf: layoutRoles(input.options) },
      ),
      input.context,
    ),
  'feature-internal-import': featureBoundaryRule(featureInternalImportFindings),
  'shared-imports-feature': featureBoundaryRule(sharedImportsFeatureFindings),
  'feature-cycle': featureBoundaryRule(featureCycleFindings),
  'foreign-feature-persistence': (input) =>
    foreignPersistenceFindings(withoutGenerated(moduleGraph(input.facts)), {
      ...input.context,
      roleOf: layoutRoles(input.options),
    }),
};
