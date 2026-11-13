import { eslintRule, lazyRecipe } from './lazy-recipe.mjs';

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
    module: './moves/test-placement.mjs',
    exportName: 'noTestHelpersInSourceRecipe',
  }),
  lazyRecipe({
    id: 'typescript-no-external-executables-in-unit-tests',
    rule: eslintRule('no-external-executables-in-unit-tests'),
    module: './moves/test-placement.mjs',
    exportName: 'noExternalExecutablesInUnitTestsRecipe',
  }),
  lazyRecipe({
    id: 'typescript-no-uncollected-tests',
    rule: eslintRule('no-uncollected-tests'),
    module: './moves/test-placement.mjs',
    exportName: 'noUncollectedTestsRecipe',
  }),
  lazyRecipe({
    id: 'typescript-shared-used-by-one-feature',
    rule: { tool: 'coupling', rule: 'shared-used-by-one-feature' },
    module: './moves/shared-used-by-one-feature.mjs',
    exportName: 'sharedUsedByOneFeatureRecipe',
  }),
];
