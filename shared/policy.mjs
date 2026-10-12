// The single source for the custom checks nitpicker adds on top of third-party tools: rule ids,
// default limits, failure-message templates and the languages that enforce each rule. Every
// language adapter reads it, and `spec/checks.md` is generated from it (`npm run gen:checks`).
//
// Language-neutral: no imports, so any entry point can load it. Nothing under `shared/` may
// import from `core/`, `languages/` or a tool package (shared/import-direction.test.mjs).

export const LANGUAGES = ['typescript', 'java'];

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
  fileLines: 'file-lines-limit',
  lineLength: 'line-length-limit',
  folderFiles: 'folder-files-limit',
};

/** Per-function structure limits, keyed by the metric name the TypeScript analyzer reports. */
export const FUNCTION_STRUCTURE_LIMITS = {
  lines: { limit: 50, ruleId: RULE_IDS.functionLines },
  statements: { limit: 15, ruleId: RULE_IDS.functionStatements },
  maxControlNesting: { limit: 2, ruleId: RULE_IDS.functionControlNesting },
  parameters: { limit: 3, ruleId: RULE_IDS.functionParameters },
};

/**
 * Per-file limits, keyed by their `thresholds` name. `fileLines` applies to source files and
 * `testFileLines` to test files; `folderFiles` counts the source files and the test files directly in
 * one folder separately.
 */
export const FILE_LIMIT_DEFAULTS = {
  fileLines: 300,
  testFileLines: 500,
  lineLength: 120,
  folderFiles: 6,
};

/** Rules any preset lets `exceptions` lift for some paths (the TypeScript preset also takes ESLint rules). */
export const SHARED_EXCEPTION_RULES = [
  RULE_IDS.fileLines,
  RULE_IDS.lineLength,
  RULE_IDS.folderFiles,
];

const EXCEPTION_HINT =
  'If this is intended, add an exception for this rule in nitpicker.config.json.';

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
  changedBranchCoverage: 'Branch coverage is {percent}%; minimum is {minimum}%',
  fileLines: `{path} has {value} lines (limit {limit}). Split it into files by responsibility. ${EXCEPTION_HINT}`,
  lineLength: `Line is {value} characters (limit {limit}). Break it up or extract a named value. ${EXCEPTION_HINT}`,
  folderFiles: `{path} has {value} {kind} files directly in it (limit {limit}). Group related files into subfolders. ${EXCEPTION_HINT}`,
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
  fileLines:
    '{path} grew from {base} to {value} lines (limit {limit}). Put new code in a new file.',
  folderFiles:
    '{path} grew from {base} to {value} {kind} files (limit {limit}). Put the new file in a subfolder.',
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
  fileLines:
    '{path}: {value} lines (limit {limit}), allowed because base was {base}; any increase fails.',
  folderFiles:
    '{path}: {value} {kind} files (limit {limit}), allowed because base was {base}; any increase fails.',
};

const BOTH = { typescript: true, java: true };
const TYPESCRIPT_ONLY = { typescript: true, java: false };

/**
 * The catalog of custom rules for `spec/checks.md`. `limit` is the human text of the default
 * threshold; `enforcedBy` says which languages enforce the rule today.
 */
export const RULES = [
  {
    id: RULE_IDS.functionLines,
    check: 'structure',
    limit: `more than ${String(FUNCTION_STRUCTURE_LIMITS.lines.limit)} lines`,
    enforcedBy: BOTH,
  },
  {
    id: RULE_IDS.functionStatements,
    check: 'structure',
    limit: `more than ${String(FUNCTION_STRUCTURE_LIMITS.statements.limit)} statements`,
    enforcedBy: BOTH,
  },
  {
    id: RULE_IDS.functionControlNesting,
    check: 'structure',
    limit: `control nesting deeper than ${String(FUNCTION_STRUCTURE_LIMITS.maxControlNesting.limit)}`,
    enforcedBy: BOTH,
  },
  {
    id: RULE_IDS.functionParameters,
    check: 'structure',
    limit: `more than ${String(FUNCTION_STRUCTURE_LIMITS.parameters.limit)} parameters`,
    enforcedBy: BOTH,
  },
  {
    id: RULE_IDS.crapScoreLimit,
    check: 'crap',
    limit: `CRAP score at or above ${String(DEFAULT_CRAP_SCORE_LIMIT)}; override with \`QUALITY_CRAP_SCORE_LIMIT\` (positive number) or \`thresholds.crapLimit\``,
    enforcedBy: BOTH,
  },
  {
    id: RULE_IDS.crapCoverageUnknown,
    check: 'crap',
    limit: 'function with unknown coverage and no CRAP score',
    enforcedBy: BOTH,
  },
  {
    id: RULE_IDS.changedBranchCoverage,
    check: 'coverage',
    limit: `a changed branch with coverage below ${String(MINIMUM_BRANCH_COVERAGE)}%`,
    enforcedBy: BOTH,
  },
  {
    id: RULE_IDS.mutantSurvived,
    check: 'mutation',
    limit: 'no score gate (`thresholds.break` is `null`); each new surviving mutant fails',
    enforcedBy: BOTH,
  },
  {
    id: RULE_IDS.mutantNoCoverage,
    check: 'mutation',
    limit: 'no score gate (`thresholds.break` is `null`); each new uncovered mutant fails',
    enforcedBy: BOTH,
  },
  {
    id: RULE_IDS.duplicateClone,
    check: 'duplicates',
    limit: `jscpd in \`${DUPLICATES_MODE}\` mode; any new clone fails`,
    enforcedBy: BOTH,
  },
  {
    id: RULE_IDS.stabilityDirection,
    check: 'coupling',
    limit: 'a package depending on a less stable package',
    enforcedBy: BOTH,
  },
  {
    id: RULE_IDS.noProductionRuntime,
    check: 'test-runtime',
    limit: 'a test must exercise production runtime code',
    enforcedBy: TYPESCRIPT_ONLY,
  },
  {
    id: RULE_IDS.typeOnlyProductionDependency,
    check: 'test-runtime',
    limit: 'a test must exercise production runtime code',
    enforcedBy: TYPESCRIPT_ONLY,
  },
  {
    id: RULE_IDS.baselineExpansion,
    check: 'coding-standards',
    limit: 'raising a legacy baseline allowance fails',
    enforcedBy: BOTH,
  },
  {
    id: RULE_IDS.publicAlternativeBypass,
    check: 'entry-points',
    limit: 'none: importing around a public entry point fails',
    enforcedBy: TYPESCRIPT_ONLY,
  },
  {
    id: RULE_IDS.fileLines,
    check: 'structure',
    limit: `more than ${String(FILE_LIMIT_DEFAULTS.fileLines)} lines in a source file or ${String(FILE_LIMIT_DEFAULTS.testFileLines)} in a test file; override with \`thresholds.fileLines\` and \`thresholds.testFileLines\``,
    enforcedBy: BOTH,
  },
  {
    id: RULE_IDS.lineLength,
    check: 'structure',
    limit: `a line longer than ${String(FILE_LIMIT_DEFAULTS.lineLength)} characters, except imports, URLs and string literal text; override with \`thresholds.lineLength\` (Java: Checkstyle's own line length)`,
    enforcedBy: TYPESCRIPT_ONLY,
  },
  {
    id: RULE_IDS.folderFiles,
    check: 'structure',
    limit: `more than ${String(FILE_LIMIT_DEFAULTS.folderFiles)} source files, or test files, directly in one folder; override with \`thresholds.folderFiles\``,
    enforcedBy: BOTH,
  },
];
