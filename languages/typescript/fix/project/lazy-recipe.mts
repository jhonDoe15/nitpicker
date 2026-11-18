import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { checkoutModulePath as untypedCheckoutModulePath } from '../../../../shared/paths/checkout-module.mjs';
import { fieldOf } from '../../../../shared/values/readers.mts';
import type { RuleRef } from '../../../../core/fix/typed/fix-types.mts';
import type { FixContext, ProjectPlan, ProjectRecipe } from './typed/project-types.mts';

const checkoutModulePath: (path: string) => string = untypedCheckoutModulePath;

type LazyRecipe = {
  readonly id: string;
  readonly rule: RuleRef;
  readonly module: string;
  readonly exportName: string;
  readonly safety?: string;
};

type Planner = { readonly plan: (context: FixContext) => ProjectPlan };

function isPlanner(value: unknown): value is Planner {
  return typeof fieldOf(value, 'plan') === 'function';
}

const require = createRequire(import.meta.url);

const PRESETS = ['typescript', 'javascript'];

function modulePath(module: string): string {
  return checkoutModulePath(fileURLToPath(new URL(module, import.meta.url)));
}

export function lazyRecipe({
  id,
  rule,
  module,
  exportName,
  safety = 'review',
}: LazyRecipe): ProjectRecipe {
  return {
    id,
    rules: [rule],
    presets: PRESETS,
    scope: 'project',
    safety,
    plan: (context: FixContext) => {
      const loaded: unknown = require(modulePath(module));
      const recipe = fieldOf(loaded, exportName);
      if (!isPlanner(recipe)) {
        throw new TypeError(`${module} does not export ${exportName}`);
      }
      return recipe.plan(context);
    },
  };
}

export function eslintRule(ruleId: string): RuleRef {
  return { tool: 'eslint', rule: `nitpicker/${ruleId}` };
}
