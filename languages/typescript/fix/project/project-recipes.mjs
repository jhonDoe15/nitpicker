import { eslintRule, lazyRecipe } from './lazy-recipe.mjs';

const TEST_PLACEMENT = './moves/test-placement.mjs';

function structureRule(rule) {
  return { tool: 'structure', rule };
}

export const PROJECT_RECIPES = [
  lazyRecipe({
    id: 'typescript-no-default-export',
    rule: eslintRule('no-default-export'),
    module: './default-export/no-default-export.mjs',
    exportName: 'noDefaultExportRecipe',
  }),
  lazyRecipe({
    id: 'typescript-file-name-casing',
    rule: eslintRule('file-name-casing'),
    module: './moves/file-name-casing.mjs',
    exportName: 'fileNameCasingRecipe',
  }),
  lazyRecipe({
    id: 'typescript-naming-convention',
    rule: eslintRule('naming-convention'),
    module: './renames/naming-convention.mjs',
    exportName: 'namingConventionRecipe',
  }),
  lazyRecipe({
    id: 'typescript-no-compatibility-shim',
    rule: eslintRule('no-compatibility-shim'),
    module: './renames/no-compatibility-shim.mjs',
    exportName: 'noCompatibilityShimRecipe',
  }),
  lazyRecipe({
    id: 'typescript-no-test-helpers-in-source',
    rule: eslintRule('no-test-helpers-in-source'),
    module: TEST_PLACEMENT,
    exportName: 'noTestHelpersInSourceRecipe',
  }),
  lazyRecipe({
    id: 'typescript-no-external-executables-in-unit-tests',
    rule: eslintRule('no-external-executables-in-unit-tests'),
    module: TEST_PLACEMENT,
    exportName: 'noExternalExecutablesInUnitTestsRecipe',
  }),
  lazyRecipe({
    id: 'typescript-no-uncollected-tests',
    rule: eslintRule('no-uncollected-tests'),
    module: TEST_PLACEMENT,
    exportName: 'noUncollectedTestsRecipe',
  }),
  lazyRecipe({
    id: 'typescript-shared-used-by-one-feature',
    rule: { tool: 'coupling', rule: 'shared-used-by-one-feature' },
    module: './moves/shared-used-by-one-feature.mjs',
    exportName: 'sharedUsedByOneFeatureRecipe',
  }),
  lazyRecipe({
    id: 'typescript-public-alternative-bypass',
    rule: { tool: 'entry-points', rule: 'public-alternative-bypass' },
    module: './imports/entry-point-imports.mjs',
    exportName: 'publicAlternativeBypassRecipe',
  }),
  lazyRecipe({
    id: 'typescript-feature-internals-only-through-index',
    rule: { tool: 'dependency-architecture', rule: 'feature-internals-only-through-index' },
    module: './imports/entry-point-imports.mjs',
    exportName: 'featureInternalsOnlyThroughIndexRecipe',
  }),
  lazyRecipe({
    id: 'typescript-duplicate-definition',
    rule: structureRule('duplicate-definition'),
    module: './reuse/duplicate-definition.mjs',
    exportName: 'duplicateDefinitionRecipe',
  }),
  lazyRecipe({
    id: 'typescript-exported-name-collision',
    rule: structureRule('exported-name-collision'),
    module: './reuse/name-collision.mjs',
    exportName: 'exportedNameCollisionRecipe',
    safety: 'safe',
  }),
  lazyRecipe({
    id: 'typescript-extract-near-duplicate',
    rule: structureRule('near-duplicate'),
    module: './extract/whole/near-duplicate-extract.mjs',
    exportName: 'nearDuplicateExtractRecipe',
    safety: 'safe',
  }),
  lazyRecipe({
    id: 'typescript-extract-partial-run',
    rule: structureRule('near-duplicate'),
    module: './extract/partial/partial-run-extract.mjs',
    exportName: 'partialRunExtractRecipe',
    safety: 'review',
  }),
  lazyRecipe({
    id: 'typescript-no-forwarding-wrapper',
    rule: eslintRule('no-forwarding-wrapper'),
    module: './wrappers/forwarding-wrapper.mjs',
    exportName: 'noForwardingWrapperRecipe',
  }),
  lazyRecipe({
    id: 'typescript-unused-prop',
    rule: structureRule('unused-prop'),
    module: './members/unused-members.mjs',
    exportName: 'unusedPropRecipe',
  }),
  lazyRecipe({
    id: 'typescript-unused-option',
    rule: structureRule('unused-option'),
    module: './members/unused-members.mjs',
    exportName: 'unusedOptionRecipe',
  }),
  lazyRecipe({
    id: 'typescript-test-only-export',
    rule: { tool: 'dead-code', rule: 'test-only-export' },
    module: './members/test-only-export.mjs',
    exportName: 'testOnlyExportRecipe',
  }),
  lazyRecipe({
    id: 'typescript-no-dev-dependency-in-production',
    rule: eslintRule('no-dev-dependency-in-production'),
    module: './manifest/dev-dependency.mjs',
    exportName: 'noDevDependencyInProductionRecipe',
  }),
];
