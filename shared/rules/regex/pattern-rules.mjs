const BACKTRACKING_HINT =
  ' Rewrite the pattern without nested or overlapping quantifiers, or use a string method. An exception fits only when the input is bounded and trusted.';

const INERT_PART_HINT =
  ' That part of the pattern never changes what it matches: remove it, or rewrite it to match what was meant.';

const MISLEADING_PART_HINT =
  ' This part does not do what it looks like: rewrite the pattern to match what was meant.';

const SIMPLER_FORM_HINT = ' Write the simpler form: it matches the same text.';

const EMPTY_ALTERNATIVE_HINT =
  ' Remove the empty alternative and make the group optional (`(?:a|b)?`), or `??` when the empty match must win.';

const OBSCURE_RANGE_HINT =
  ' Write the range with escapes (`[\\x20-\\x7E]`) or list its characters, so the reader sees what it covers.';

const INERT_PART_RULES = [
  'no-dupe-characters-character-class',
  'no-dupe-disjunctions',
  'no-empty-capturing-group',
  'no-empty-group',
  'no-empty-lookarounds-assertion',
  'no-optional-assertion',
  'no-useless-set-operand',
  'no-zero-quantifier',
  'optimal-lookaround-quantifier',
];

const MISLEADING_PART_RULES = [
  'confusing-quantifier',
  'no-contradiction-with-assertion',
  'no-lazy-ends',
  'no-misleading-capturing-group',
  'no-potentially-useless-backreference',
  'no-useless-assertions',
  'no-useless-backreference',
];

const SIMPLER_FORM_RULES = [
  'no-extra-lookaround-assertions',
  'no-trivially-nested-assertion',
  'no-trivially-nested-quantifier',
  'no-useless-character-class',
  'no-useless-lazy',
  'no-useless-non-capturing-group',
  'no-useless-quantifier',
  'no-useless-range',
  'no-useless-string-literal',
  'no-useless-two-nums-quantifier',
  'optimal-quantifier-concatenation',
  'prefer-predefined-assertion',
  'simplify-set-operations',
];

function prefixed(rule) {
  return `regexp/${rule}`;
}

const PATTERN_HINTS = new Map([
  ['regexp/no-super-linear-backtracking', BACKTRACKING_HINT],
  ['regexp/no-obscure-range', OBSCURE_RANGE_HINT],
  ['regexp/no-empty-alternative', EMPTY_ALTERNATIVE_HINT],
  ...INERT_PART_RULES.map((rule) => [prefixed(rule), INERT_PART_HINT]),
  ...MISLEADING_PART_RULES.map((rule) => [prefixed(rule), MISLEADING_PART_HINT]),
  ...SIMPLER_FORM_RULES.map((rule) => [prefixed(rule), SIMPLER_FORM_HINT]),
]);

export function patternRuleHints() {
  return [...PATTERN_HINTS];
}

export const patternRuleIds = [...PATTERN_HINTS.keys()].toSorted();
