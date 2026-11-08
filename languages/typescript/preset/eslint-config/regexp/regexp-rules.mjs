import {
  patternRuleHints,
  patternRuleIds,
} from '../../../../../shared/rules/regex/pattern-rules.mjs';

const USELESS_FLAG_HINT =
  ' Remove the flag: a `g` or `y` regex keeps `lastIndex` between calls, so a reused one gives order-dependent results.';

const MISSING_G_FLAG_HINT = ' Add the `g` flag: without it the call throws a TypeError.';

const JAVASCRIPT_HINTS = new Map([
  ['regexp/no-useless-flag', USELESS_FLAG_HINT],
  ['regexp/no-missing-g-flag', MISSING_G_FLAG_HINT],
]);

const SELF_EXPLAINING_RULES = [
  'regexp/no-escape-backspace',
  'regexp/no-misleading-unicode-character',
  'regexp/no-useless-dollar-replacements',
];

const RULE_OPTIONS = new Map([['regexp/no-useless-flag', { ignore: ['i', 'm', 's'] }]]);

export function regexpRuleHints() {
  return [...patternRuleHints(), ...JAVASCRIPT_HINTS];
}

export const regexpRuleIds = [
  ...patternRuleIds,
  ...JAVASCRIPT_HINTS.keys(),
  ...SELF_EXPLAINING_RULES,
].toSorted();

export function regexpRules() {
  return Object.fromEntries(
    regexpRuleIds.map((rule) => {
      const options = RULE_OPTIONS.get(rule);
      return [rule, options === undefined ? 'error' : ['error', options]];
    }),
  );
}
