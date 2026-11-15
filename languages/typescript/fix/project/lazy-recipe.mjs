import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { checkoutModulePath } from '../../../../shared/paths/checkout-module.mjs';

const require = createRequire(import.meta.url);

const PRESETS = ['typescript', 'javascript'];

function modulePath(module) {
  return checkoutModulePath(fileURLToPath(new URL(module, import.meta.url)));
}

export function lazyRecipe({ id, rule, module, exportName, safety = 'review' }) {
  return {
    id,
    rules: [rule],
    presets: PRESETS,
    scope: 'project',
    safety,
    plan: (context) => require(modulePath(module))[exportName].plan(context),
  };
}

export function eslintRule(ruleId) {
  return { tool: 'eslint', rule: `nitpicker/${ruleId}` };
}
