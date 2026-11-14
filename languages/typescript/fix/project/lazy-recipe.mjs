import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const PRESETS = ['typescript', 'javascript'];

export function lazyRecipe({ id, rule, module, exportName, safety = 'review' }) {
  return {
    id,
    rules: [rule],
    presets: PRESETS,
    scope: 'project',
    safety,
    plan: (context) => require(module)[exportName].plan(context),
  };
}

export function eslintRule(ruleId) {
  return { tool: 'eslint', rule: `nitpicker/${ruleId}` };
}
