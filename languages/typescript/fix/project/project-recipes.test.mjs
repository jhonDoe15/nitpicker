import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { PROJECT_RECIPES } from './project-recipes.mjs';

const require = createRequire(import.meta.url);
const MODULES = {
  'typescript-no-default-export': [
    './default-export/no-default-export.mjs',
    'noDefaultExportRecipe',
  ],
  'typescript-file-name-casing': ['./moves/file-name-casing.mjs', 'fileNameCasingRecipe'],
  'typescript-naming-convention': ['./renames/naming-convention.mjs', 'namingConventionRecipe'],
  'typescript-no-compatibility-shim': [
    './renames/no-compatibility-shim.mjs',
    'noCompatibilityShimRecipe',
  ],
  'typescript-no-test-helpers-in-source': [
    './moves/test-placement.mjs',
    'noTestHelpersInSourceRecipe',
  ],
  'typescript-no-external-executables-in-unit-tests': [
    './moves/test-placement.mjs',
    'noExternalExecutablesInUnitTestsRecipe',
  ],
  'typescript-no-uncollected-tests': ['./moves/test-placement.mjs', 'noUncollectedTestsRecipe'],
  'typescript-shared-used-by-one-feature': [
    './moves/shared-used-by-one-feature.mjs',
    'sharedUsedByOneFeatureRecipe',
  ],
};

describe('PROJECT_RECIPES', () => {
  it('lists every project recipe once, as review recipes of project scope', () => {
    expect(PROJECT_RECIPES.map(({ id }) => id).toSorted()).toEqual(Object.keys(MODULES).toSorted());
    expect(new Set(PROJECT_RECIPES.map(({ safety, scope }) => `${safety} ${scope}`))).toEqual(
      new Set(['review project']),
    );
  });

  it('describes each recipe as the recipe module it loads on demand does', () => {
    for (const recipe of PROJECT_RECIPES) {
      const [module, exportName] = MODULES[recipe.id];
      const loaded = require(module)[exportName];
      expect([loaded.id, loaded.rules, loaded.presets, loaded.safety, loaded.scope]).toEqual([
        recipe.id,
        recipe.rules,
        recipe.presets,
        recipe.safety,
        recipe.scope,
      ]);
    }
  });
});
