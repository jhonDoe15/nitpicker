import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { checkoutModulePath as untypedCheckoutModulePath } from '../../../../shared/paths/checkout-module.mjs';
import { fieldOf } from '../../../../shared/values/readers.mts';
import { PROJECT_RECIPES as UNTYPED_RECIPES } from './project-recipes.mts';

type ProjectRecipe = {
  readonly id: string;
  readonly rules: readonly unknown[];
  readonly presets: readonly string[];
  readonly safety: string;
  readonly scope: string;
};

const require = createRequire(import.meta.url);
const checkoutModulePath: (file: string) => string = untypedCheckoutModulePath;
const PROJECT_RECIPES: readonly ProjectRecipe[] = UNTYPED_RECIPES;
const MODULES: Readonly<Record<string, readonly [string, string]>> = {
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
  'typescript-public-alternative-bypass': [
    './imports/entry-point-imports.mjs',
    'publicAlternativeBypassRecipe',
  ],
  'typescript-feature-internals-only-through-index': [
    './imports/entry-point-imports.mjs',
    'featureInternalsOnlyThroughIndexRecipe',
  ],
  'typescript-duplicate-definition': [
    './reuse/duplicate-definition.mjs',
    'duplicateDefinitionRecipe',
  ],
  'typescript-exported-name-collision': [
    './reuse/name-collision.mjs',
    'exportedNameCollisionRecipe',
  ],
  'typescript-extract-near-duplicate': [
    './extract/whole/near-duplicate-extract.mjs',
    'nearDuplicateExtractRecipe',
  ],
  'typescript-extract-partial-run': [
    './extract/partial/partial-run-extract.mjs',
    'partialRunExtractRecipe',
  ],
  'typescript-no-forwarding-wrapper': [
    './wrappers/forwarding-wrapper.mjs',
    'noForwardingWrapperRecipe',
  ],
  'typescript-unused-prop': ['./members/unused-members.mjs', 'unusedPropRecipe'],
  'typescript-unused-option': ['./members/unused-members.mjs', 'unusedOptionRecipe'],
  'typescript-test-only-export': ['./members/test-only-export.mjs', 'testOnlyExportRecipe'],
  'typescript-no-dev-dependency-in-production': [
    './manifest/dev-dependency.mjs',
    'noDevDependencyInProductionRecipe',
  ],
};

function traits({ id, rules, presets, safety, scope }: ProjectRecipe) {
  return { id, rules, presets, safety, scope };
}

function isRecipe(value: unknown): value is ProjectRecipe {
  return typeof fieldOf(value, 'id') === 'string';
}

function loaded(recipe: ProjectRecipe): ProjectRecipe {
  const [module = '', exportName = ''] = MODULES[recipe.id] ?? [];
  const loadedModule: unknown = require(
    checkoutModulePath(fileURLToPath(new URL(module, import.meta.url))),
  );
  const found = fieldOf(loadedModule, exportName);
  if (!isRecipe(found)) {
    throw new TypeError(`${exportName} is not a project recipe`);
  }
  return found;
}

describe('PROJECT_RECIPES', () => {
  it('lists every project recipe once, as recipes of project scope', () => {
    const ids = PROJECT_RECIPES.map(({ id }) => id);
    expect(ids.toSorted((left, right) => left.localeCompare(right))).toEqual(
      Object.keys(MODULES).toSorted((left, right) => left.localeCompare(right)),
    );
    expect(new Set(PROJECT_RECIPES.map(({ safety, scope }) => `${safety} ${scope}`))).toEqual(
      new Set(['review project', 'safe project']),
    );
  });

  it('describes each recipe as the recipe module it loads on demand does', () => {
    expect(PROJECT_RECIPES.map(loaded).map(traits)).toEqual(PROJECT_RECIPES.map(traits));
  });
});
