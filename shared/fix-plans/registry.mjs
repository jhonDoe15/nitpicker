import { COVERAGE_BUILDERS } from './builders/measured/index.mjs';
import { DESIGN_BUILDERS } from './builders/design/index.mjs';
import { FAMILY_BUILDERS } from './builders/families/index.mjs';
import { SIZE_BUILDERS } from './builders/size/index.mjs';

export const PLAN_KINDS = Object.freeze([
  'extract-function',
  'split-file',
  'add-test-for-branch',
  'strengthen-assertion',
  'kill-mutant',
  'remove-duplicate',
  'extract-shared-function',
  'invert-dependency',
  'move-module',
  'parse-at-boundary',
  'reduce-complexity',
  'group-parameters',
  'flatten-hierarchy',
  'exercise-production-code',
  'follow-allowed-form',
]);

function invalid(builder, problem) {
  return new Error(`Plan builder ${builder?.id ?? '(no id)'} ${problem}`);
}

function checkBuilder(builder) {
  if (typeof builder?.id !== 'string' || builder.id === '') {
    throw invalid(builder, 'has no id');
  }
  const rules = builder.rules;
  if (!Array.isArray(rules) || rules.length === 0) {
    throw invalid(builder, 'lists no rules');
  }
  if (rules.some((rule) => typeof rule?.tool !== 'string' || typeof rule.rule !== 'string')) {
    throw invalid(builder, 'lists a rule without a tool and a rule id');
  }
  if (!Array.isArray(builder.presets) || builder.presets.length === 0) {
    throw invalid(builder, 'lists no presets');
  }
  if (typeof builder.build !== 'function') {
    throw invalid(builder, 'has no build function');
  }
}

function ruleKey({ tool, rule }) {
  return `${tool}/${rule}`;
}

function repeatedRule(builder, keys) {
  return builder.rules.map(ruleKey).find((key) => keys.has(key));
}

/** Checks the builders: each has an id, rules, presets and a build function, and no rule has two. */
export function defineBuilders(builders) {
  const ids = new Set();
  const keys = new Set();
  for (const builder of builders) {
    checkBuilder(builder);
    if (ids.has(builder.id)) {
      throw invalid(builder, 'repeats an id');
    }
    const repeated = repeatedRule(builder, keys);
    if (repeated !== undefined) {
      throw invalid(builder, `repeats the rule ${repeated}`);
    }
    ids.add(builder.id);
    for (const rule of builder.rules) {
      keys.add(ruleKey(rule));
    }
  }
  return Object.freeze([...builders]);
}

export const PLAN_BUILDERS = defineBuilders([
  ...SIZE_BUILDERS,
  ...COVERAGE_BUILDERS,
  ...DESIGN_BUILDERS,
  ...FAMILY_BUILDERS,
]);

/** The rules that have a plan, with their presets, as the rule reference lists them. */
export function fixPlanRules(builders = PLAN_BUILDERS) {
  return builders.flatMap(({ rules, presets }) =>
    rules.map(({ tool, rule }) => ({ tool, rule, presets })),
  );
}

/** The builder of the reference entry (`tool` and `rule` as the reference names them), if any. */
export function builderForEntry(entry, builders = PLAN_BUILDERS) {
  return builders.find(({ rules }) =>
    rules.some(({ tool, rule }) => tool === entry.tool && rule === entry.rule),
  );
}
