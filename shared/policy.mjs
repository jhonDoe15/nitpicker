// The single source for the custom checks nitpicker adds on top of third-party tools: rule ids,
// default limits, failure-message templates and the languages that enforce each rule. Every
// language adapter reads it, and `spec/checks.md` is generated from it (`npm run gen:checks`).
//
// Language-neutral: no imports, so any entry point can load it. Nothing under `shared/` may
// import from `core/`, `languages/` or a tool package (shared/import-direction.test.mjs).

export const LANGUAGES = ['typescript', 'java', 'python', 'kotlin'];

export const RULE_IDS = {
  functionLines: 'function-lines-limit',
  functionStatements: 'function-statements-limit',
  functionControlNesting: 'function-control-nesting-limit',
  functionParameters: 'function-parameters-limit',
  crapScoreLimit: 'crap-score-limit',
  crapCoverageUnknown: 'crap-coverage-unknown',
  changedBranchCoverage: 'changed-branch-coverage',
  mutantSurvived: 'mutant-survived',
  mutantNoCoverage: 'mutant-nocoverage',
  duplicateClone: 'duplicate-clone',
  stabilityDirection: 'stability-direction',
  baselineExpansion: 'baseline-expansion',
  publicAlternativeBypass: 'public-alternative-bypass',
  noProductionRuntime: 'no-production-runtime',
  typeOnlyProductionDependency: 'type-only-production-dependency',
};

/** Per-function structure limits, keyed by the metric name the TypeScript analyzer reports. */
export const FUNCTION_STRUCTURE_LIMITS = {
  lines: { limit: 50, ruleId: RULE_IDS.functionLines },
  statements: { limit: 15, ruleId: RULE_IDS.functionStatements },
  maxControlNesting: { limit: 2, ruleId: RULE_IDS.functionControlNesting },
  parameters: { limit: 3, ruleId: RULE_IDS.functionParameters },
};

/** A CRAP score at or above this fails (`QUALITY_CRAP_SCORE_LIMIT` / `thresholds.crapLimit` override it). */
export const DEFAULT_CRAP_SCORE_LIMIT = 9;

/** A changed branch below this percentage of coverage fails. */
export const MINIMUM_BRANCH_COVERAGE = 95;

/** The jscpd detection mode for both languages (also written into languages/typescript/preset/defaults/jscpd.json). */
export const DUPLICATES_MODE = 'mild';

/** Mutant statuses that fail the gate; every other non-killed status is report-only. */
export const ENFORCED_MUTATION_STATUSES = ['Survived', 'NoCoverage'];

/** The rule id of a mutant finding, for example `mutant-survived` or `mutant-nocoverage`. */
export function mutantRuleId(status) {
  return `mutant-${status.toLowerCase()}`;
}

/**
 * Rules held to the "touched code" standard: a finding on a line the change touched is new even
 * if the base had it. `tools` limits a rule to findings from those tools (the TypeScript check of
 * the same name keys its identity on branch source instead).
 */
export const TOUCHED_CODE_RULES = [{ rule: RULE_IDS.changedBranchCoverage, tools: ['jacoco'] }];

/** Failure-message templates; `{name}` placeholders are filled by `renderMessage`. */
export const MESSAGES = {
  functionStructure: '{name} has {value} {metric}; limit is {limit}',
  functionStatements:
    '{name} has {value} statements; limit is {limit}. Split by responsibility and name each part for what it checks or does.',
  functionControlNesting:
    '{name} nests control flow {value} deep (limit {limit}). Return early instead of nesting.',
  crapScoreLimit:
    '{name} has CRAP {crap}; score must be below {limit}. Test its uncovered branches, or split a branchy part into its own function.',
  crapCoverageUnknown:
    '{name} has unknown coverage and no CRAP score: no test runs it. Add a test that calls it; for inline composition-root wiring, move it to a named function in adapters/ and test that.',
  crapCoverageUnknownPlain:
    '{name} has unknown coverage and no CRAP score: no test runs it. Add a test that calls it.',
  changedBranchCoverage: 'Branch coverage is {percent}%; minimum is {minimum}%',
};

export function renderMessage(template, values) {
  return template.replaceAll(/\{(\w+)\}/g, (_, key) => String(values[key]));
}

/**
 * Messages for a function that was already over a limit on the base and got worse. `{base}` is left
 * in the text for the comparison to fill in (it knows the base value); `GREW_MESSAGES[metric]`
 * covers the structure limits and `crap` the CRAP score limit.
 */
export const GREW_MESSAGES = {
  lines:
    '{name} grew from {base} to {value} lines (limit {limit}). Put new code in a new function.',
  statements:
    '{name} grew from {base} to {value} statements (limit {limit}). Put new code in a new function.',
  maxControlNesting:
    '{name} control nesting grew from {base} to {value} levels (limit {limit}). Put the new nested code in a new function.',
  parameters:
    '{name} grew from {base} to {value} parameters (limit {limit}). Group related parameters into one object instead of adding another.',
  crap: '{name} CRAP rose from {base} to {crap} (limit {limit}). Put new code in a new function and cover it with tests.',
};

export const HELD_MESSAGES = {
  lines:
    '{name}: {value} lines (limit {limit}), allowed because base was {base}; any increase fails.',
  statements:
    '{name}: {value} statements (limit {limit}), allowed because base was {base}; any increase fails.',
  maxControlNesting:
    '{name}: control nesting {value} (limit {limit}), allowed because base was {base}; any increase fails.',
  parameters:
    '{name}: {value} parameters (limit {limit}), allowed because base was {base}; any increase fails.',
  crap: '{name}: CRAP {crap} (limit {limit}), allowed because base was {base}; any increase fails.',
};

const BOTH = { typescript: true, java: true, python: false };
const ALL = { typescript: true, java: true, python: true };
const TYPESCRIPT_ONLY = { typescript: true, java: false, python: false };
const withKotlin = (enforcedBy, kotlin) => ({ ...enforcedBy, kotlin });

/**
 * The catalog of custom rules for `spec/checks.md`. `limit` is the human text of the default
 * threshold; `enforcedBy` says which languages enforce the rule today.
 */
export const RULES = [
  {
    id: RULE_IDS.functionLines,
    check: 'structure',
    limit: `more than ${String(FUNCTION_STRUCTURE_LIMITS.lines.limit)} lines`,
    enforcedBy: withKotlin(BOTH, true),
  },
  {
    id: RULE_IDS.functionStatements,
    check: 'structure',
    limit: `more than ${String(FUNCTION_STRUCTURE_LIMITS.statements.limit)} statements`,
    enforcedBy: withKotlin(BOTH, true),
  },
  {
    id: RULE_IDS.functionControlNesting,
    check: 'structure',
    limit: `control nesting deeper than ${String(FUNCTION_STRUCTURE_LIMITS.maxControlNesting.limit)}`,
    enforcedBy: withKotlin(BOTH, true),
  },
  {
    id: RULE_IDS.functionParameters,
    check: 'structure',
    limit: `more than ${String(FUNCTION_STRUCTURE_LIMITS.parameters.limit)} parameters`,
    enforcedBy: withKotlin(BOTH, true),
  },
  {
    id: RULE_IDS.crapScoreLimit,
    check: 'crap',
    limit: `CRAP score at or above ${String(DEFAULT_CRAP_SCORE_LIMIT)}; override with \`QUALITY_CRAP_SCORE_LIMIT\` (positive number) or \`thresholds.crapLimit\``,
    enforcedBy: withKotlin(BOTH, true),
  },
  {
    id: RULE_IDS.crapCoverageUnknown,
    check: 'crap',
    limit: 'function with unknown coverage and no CRAP score',
    enforcedBy: withKotlin(BOTH, true),
  },
  {
    id: RULE_IDS.changedBranchCoverage,
    check: 'coverage',
    limit: `a changed branch with coverage below ${String(MINIMUM_BRANCH_COVERAGE)}%`,
    enforcedBy: withKotlin(BOTH, false),
  },
  {
    id: RULE_IDS.mutantSurvived,
    check: 'mutation',
    limit: 'no score gate (`thresholds.break` is `null`); each new surviving mutant fails',
    enforcedBy: withKotlin(ALL, false),
  },
  {
    id: RULE_IDS.mutantNoCoverage,
    check: 'mutation',
    limit: 'no score gate (`thresholds.break` is `null`); each new uncovered mutant fails',
    enforcedBy: withKotlin(ALL, false),
  },
  {
    id: RULE_IDS.duplicateClone,
    check: 'duplicates',
    limit: `jscpd in \`${DUPLICATES_MODE}\` mode; any new clone fails`,
    enforcedBy: withKotlin(ALL, true),
  },
  {
    id: RULE_IDS.stabilityDirection,
    check: 'coupling',
    limit: 'a package depending on a less stable package',
    enforcedBy: withKotlin(ALL, true),
  },
  {
    id: RULE_IDS.noProductionRuntime,
    check: 'test-runtime',
    limit: 'a test must exercise production runtime code',
    enforcedBy: withKotlin(TYPESCRIPT_ONLY, false),
  },
  {
    id: RULE_IDS.typeOnlyProductionDependency,
    check: 'test-runtime',
    limit: 'a test must exercise production runtime code',
    enforcedBy: withKotlin(TYPESCRIPT_ONLY, false),
  },
  {
    id: RULE_IDS.baselineExpansion,
    check: 'coding-standards',
    limit: 'raising a legacy baseline allowance fails',
    enforcedBy: withKotlin(BOTH, true),
  },
  {
    id: RULE_IDS.publicAlternativeBypass,
    check: 'entry-points',
    limit: 'none: importing around a public entry point fails',
    enforcedBy: withKotlin(TYPESCRIPT_ONLY, false),
  },
];
