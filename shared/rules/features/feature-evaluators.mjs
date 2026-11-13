import {
  featureInternalImportFindings,
  sharedImportsFeatureFindings,
} from './feature-boundaries.mjs';
import { featureCycleFindings } from './feature-cycles.mjs';
import { featureLayout, featureRoleContract, featureRoles } from './feature-roles.mjs';
import { foreignPersistenceFindings } from './foreign-persistence.mjs';
import { sharedUsageFindings, sharedUsedByOneFeature } from './shared-usage.mjs';

function sharedUsageSubjects(modules) {
  return modules
    .filter(({ role, generated, initializer }) => role !== 'test' && !generated && !initializer)
    .map(({ file }) => file);
}

export function withoutGenerated(facts) {
  const generated = new Set(
    facts.modules.filter((module) => module.generated).map(({ file }) => file),
  );
  return {
    ...facts,
    imports: facts.imports.filter(({ from, to }) => !(generated.has(from) || generated.has(to))),
  };
}

export function featureContext(context, options) {
  const roleOf = featureRoleContract(options.policy.layout, options.publicFace);
  return { ...context, roleOf };
}

function featureBoundaryRule(findings) {
  return ({ facts, context, options }) =>
    findings(withoutGenerated(facts), featureContext(context, options));
}

export function layoutRoles(options) {
  return featureRoles(featureLayout(options.policy.layout));
}

export const FEATURE_EVALUATORS = {
  'shared-used-by-one-feature': ({ facts, context, options }) =>
    sharedUsageFindings(
      sharedUsedByOneFeature(
        { modules: sharedUsageSubjects(facts.modules), imports: withoutGenerated(facts).imports },
        { roleOf: layoutRoles(options) },
      ),
      context,
    ),
  'feature-internal-import': featureBoundaryRule(featureInternalImportFindings),
  'shared-imports-feature': featureBoundaryRule(sharedImportsFeatureFindings),
  'feature-cycle': featureBoundaryRule(featureCycleFindings),
  'foreign-feature-persistence': ({ facts, context, options }) =>
    foreignPersistenceFindings(withoutGenerated(facts), {
      ...context,
      roleOf: layoutRoles(options),
    }),
};
