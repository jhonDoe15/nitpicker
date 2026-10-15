// The single source for the custom checks nitpicker adds on top of third-party tools: rule ids,
// default limits, failure-message templates and the languages that enforce each rule. Every
// language adapter reads it, and `spec/checks.md` is generated from it (`npm run gen:checks`).
//
// Language-neutral: imports only the sentence builder of the exception routes. Nothing under
// `shared/` may import from `core/`, `languages/` or a tool package (shared/import-direction.test.mjs).

import { exceptionSentence } from './exceptions/sentence.mjs';

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

/** Rules a `nitpicker.config.json` exception can narrow to one function with `function`. */
export const FUNCTION_EXCEPTION_RULES = [
  ...Object.values(FUNCTION_STRUCTURE_LIMITS).map(({ ruleId }) => ruleId),
  RULE_IDS.crapScoreLimit,
  RULE_IDS.crapCoverageUnknown,
  RULE_IDS.changedBranchCoverage,
  RULE_IDS.mutantSurvived,
  RULE_IDS.mutantNoCoverage,
];

/** The only exceptions a changed-branch-coverage finding takes: they must name the function. */
export const FUNCTION_REQUIRED_RULES = [RULE_IDS.changedBranchCoverage];

/** The dead-code findings of the TypeScript and JavaScript presets: an unused file, export or type. */
export const DEAD_CODE_RULES = ['files', 'exports', 'types'];

/** Rules an exception can narrow to one declaration with `name`. */
export const NAME_EXCEPTION_RULES = ['exports', 'types'];

/**
 * Per-file limits, keyed by their `thresholds` name. `fileLines` applies to source files and
 * `testFileLines` to test files; `folderFiles` counts the source files and the test files directly in
 * one folder, each kind on its own. Every language enforces them with the same defaults.
 */
export const FILE_LIMIT_DEFAULTS = {
  fileLines: 300,
  testFileLines: 500,
  lineLength: 120,
  folderFiles: 6,
};

/** Rules an exception lifts for a path only: such a finding has no function or declaration to name. */
const PATH_EXCEPTION_RULES = [
  RULE_IDS.duplicateClone,
  RULE_IDS.stabilityDirection,
  RULE_IDS.fileLines,
  RULE_IDS.lineLength,
  RULE_IDS.folderFiles,
];

/** Rules `exceptions` can lift for some paths in any preset (TypeScript also takes ESLint rules). */
export const SHARED_EXCEPTION_RULES = [...FUNCTION_EXCEPTION_RULES, ...PATH_EXCEPTION_RULES];

/**
 * The tools that print each rule an `exceptions` entry can name, so that `<tool>/<rule>` is only
 * valid with the finding's own tool. The TypeScript and JavaScript presets also print the rules
 * listed after the shared ones.
 */
const STRUCTURE_RULES = [
  ...Object.values(FUNCTION_STRUCTURE_LIMITS).map(({ ruleId }) => ruleId),
  RULE_IDS.fileLines,
  RULE_IDS.lineLength,
  RULE_IDS.folderFiles,
];

/** The coding-standards findings of the TypeScript and JavaScript presets that an exception can lift. */
export const CODING_STANDARDS_RULES = ['public-contract-production-use'];
export const CODING_STANDARDS_RULE_PREFIXES = ['runtime-boundary/', 'callback-protocol/'];

/** The dependency-cruiser rules of the TypeScript and JavaScript presets (tool `dependency-architecture`). */
export const DEPENDENCY_RULES = [
  'no-production-to-test',
  'no-production-cycles',
  'feature-internals-only-through-index',
  'features-do-not-import-other-feature-internals',
  'shared-does-not-import-features',
  'features-do-not-import-composition-root',
  'domain-does-not-import-adapters',
  'domain-does-not-import-node-io',
  'domain-does-not-import-network-or-database-clients',
  'domain-does-not-import-the-logger',
  'domain-does-not-import-module-state',
];

export const RULE_TOOLS = new Map([
  ...STRUCTURE_RULES.map((rule) => [rule, ['structure']]),
  [RULE_IDS.crapScoreLimit, ['crap']],
  [RULE_IDS.crapCoverageUnknown, ['crap']],
  [RULE_IDS.changedBranchCoverage, ['coverage', 'jacoco', 'coverage-py']],
  [RULE_IDS.mutantSurvived, ['mutation', 'pit', 'mutmut']],
  [RULE_IDS.mutantNoCoverage, ['mutation', 'pit', 'mutmut']],
  [RULE_IDS.duplicateClone, ['duplicates']],
  [RULE_IDS.stabilityDirection, ['coupling']],
  ...DEAD_CODE_RULES.map((rule) => [rule, ['dead-code']]),
  [RULE_IDS.noProductionRuntime, ['test-runtime']],
  [RULE_IDS.typeOnlyProductionDependency, ['test-runtime']],
  [RULE_IDS.publicAlternativeBypass, ['entry-points']],
  ...CODING_STANDARDS_RULES.map((rule) => [rule, ['coding-standards']]),
  ...DEPENDENCY_RULES.map((rule) => [rule, ['dependency-architecture']]),
]);

/** The tool of a `coding-standards` rule with a prefix, such as `runtime-boundary/<rule>`. */
export const PREFIXED_RULE_TOOLS = CODING_STANDARDS_RULE_PREFIXES.map((prefix) => [
  prefix,
  ['coding-standards'],
]);

/** The tools of each preset that print rules an `exceptions` entry can name. */
export const PRESET_TOOLS = {
  typescript: [
    'structure',
    'crap',
    'coverage',
    'mutation',
    'duplicates',
    'coupling',
    'dead-code',
    'test-runtime',
    'entry-points',
    'coding-standards',
    'dependency-architecture',
  ],
  java: ['structure', 'crap', 'jacoco', 'pit', 'duplicates', 'coupling'],
  python: ['structure', 'crap', 'coverage-py', 'mutmut', 'duplicates', 'coupling'],
};
PRESET_TOOLS.javascript = PRESET_TOOLS.typescript;
PRESET_TOOLS.kotlin = PRESET_TOOLS.java;

/** The shared rules the Java preset leaves to its own tools (Checkstyle checks line length). */
export const JAVA_NATIVE_RULES = [RULE_IDS.lineLength];

/** `{exception}` is the `exceptions` entry that would lift the finding, as JSON. */
const EXCEPTION_HINT = exceptionSentence('{exception}');

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
export const TOUCHED_CODE_RULES = [
  { rule: RULE_IDS.changedBranchCoverage, tools: ['jacoco'] },
  { rule: RULE_IDS.changedBranchCoverage, tools: ['coverage-py'] },
];

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
  fileLines: `File has {value} lines (limit {limit}). Split it into files by responsibility. ${EXCEPTION_HINT}`,
  lineLength: `Line is {value} characters (limit {limit}). Break it up or extract a named value. ${EXCEPTION_HINT}`,
  folderFiles: `Folder has {value} {kind} files directly in it (limit {limit}). Group related files into subfolders (packages in Java). ${EXCEPTION_HINT}`,
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
  fileLines: `File grew from {base} to {value} lines (limit {limit}). Put new code in a new file. ${EXCEPTION_HINT}`,
  lineLength: `Line grew from {base} to {value} characters (limit {limit}). Break it up or extract a named value. ${EXCEPTION_HINT}`,
  folderFiles: `Folder grew from {base} to {value} {kind} files (limit {limit}). Put the new file in a subfolder. ${EXCEPTION_HINT}`,
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
    'File: {value} lines (limit {limit}), allowed because base was {base}; any increase fails.',
  lineLength:
    'Line: {value} characters (limit {limit}), allowed because base was {base}; any increase fails.',
  folderFiles:
    'Folder: {value} {kind} files (limit {limit}), allowed because base was {base}; any increase fails.',
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
    enforcedBy: withKotlin(ALL, true),
  },
  {
    id: RULE_IDS.functionStatements,
    check: 'structure',
    limit: `more than ${String(FUNCTION_STRUCTURE_LIMITS.statements.limit)} statements`,
    enforcedBy: withKotlin(ALL, true),
  },
  {
    id: RULE_IDS.functionControlNesting,
    check: 'structure',
    limit: `control nesting deeper than ${String(FUNCTION_STRUCTURE_LIMITS.maxControlNesting.limit)}`,
    enforcedBy: withKotlin(ALL, true),
  },
  {
    id: RULE_IDS.functionParameters,
    check: 'structure',
    limit: `more than ${String(FUNCTION_STRUCTURE_LIMITS.parameters.limit)} parameters`,
    enforcedBy: withKotlin(ALL, true),
  },
  {
    id: RULE_IDS.crapScoreLimit,
    check: 'crap',
    limit: `CRAP score at or above ${String(DEFAULT_CRAP_SCORE_LIMIT)}; override with \`QUALITY_CRAP_SCORE_LIMIT\` (positive number) or \`thresholds.crapLimit\``,
    enforcedBy: withKotlin(ALL, true),
  },
  {
    id: RULE_IDS.crapCoverageUnknown,
    check: 'crap',
    limit: 'function with unknown coverage and no CRAP score',
    enforcedBy: withKotlin(ALL, true),
  },
  {
    id: RULE_IDS.changedBranchCoverage,
    check: 'coverage',
    limit: `a changed branch with coverage below ${String(MINIMUM_BRANCH_COVERAGE)}%`,
    enforcedBy: withKotlin(ALL, true),
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
    enforcedBy: withKotlin(ALL, true),
  },
  {
    id: RULE_IDS.publicAlternativeBypass,
    check: 'entry-points',
    limit: 'none: importing around a public entry point fails',
    enforcedBy: withKotlin(TYPESCRIPT_ONLY, false),
  },
  {
    id: RULE_IDS.fileLines,
    check: 'structure',
    limit: `more than ${String(FILE_LIMIT_DEFAULTS.fileLines)} lines in a source file or ${String(FILE_LIMIT_DEFAULTS.testFileLines)} in a test file; override with \`thresholds.fileLines\` and \`thresholds.testFileLines\``,
    enforcedBy: withKotlin(ALL, true),
  },
  {
    id: RULE_IDS.lineLength,
    check: 'structure',
    limit: `a line longer than ${String(FILE_LIMIT_DEFAULTS.lineLength)} characters, except imports, URLs and string literal text; override with \`thresholds.lineLength\` (Java: Checkstyle's own line length; Kotlin: detekt's)`,
    enforcedBy: withKotlin({ ...ALL, java: false }, false),
  },
  {
    id: RULE_IDS.folderFiles,
    check: 'structure',
    limit: `more than ${String(FILE_LIMIT_DEFAULTS.folderFiles)} source files, or test files, directly in one folder; override with \`thresholds.folderFiles\``,
    enforcedBy: withKotlin(ALL, true),
  },
];
