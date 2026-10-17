import {
  FILE_RULE_IDS,
  SIZE_HELD_MESSAGES,
  SIZE_RULE_IDS,
  sizeGrewMessages,
  sizeMessages,
  sizeRules,
} from './project-rules/size-rules.mjs';
import { UNUSED_API_RULES, UNUSED_API_RULE_IDS } from './unused-api/unused-api-policy.mjs';
import { reuseRules } from './rules/reuse-rules.mjs';
import { couplingRules } from './project-rules/coupling-rules.mjs';
import { testConsoleRule } from './rules/test-runtime.mjs';
import { SOURCE_RULE_IDS, sourceRuleMessages, sourceRules } from './project-rules/source-rules.mjs';
import { HYGIENE_EXCEPTION_RULES, HYGIENE_RULES } from './project-rules/hygiene-rules.mjs';

export { FILE_LIMIT_DEFAULTS } from './project-rules/size-rules.mjs';

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
  packageCycle: 'package-cycle',
  baselineExpansion: 'baseline-expansion',
  publicAlternativeBypass: 'public-alternative-bypass',
  ...UNUSED_API_RULE_IDS,
  noProductionRuntime: 'no-production-runtime',
  typeOnlyProductionDependency: 'type-only-production-dependency',
  ...FILE_RULE_IDS,
  ...SIZE_RULE_IDS,
  slowTest: 'slow-test',
  sharedUsedByOneFeature: 'shared-used-by-one-feature',
  duplicateDefinition: 'duplicate-definition',
  siblingCopyEdit: 'sibling-copy-edit',
  exportedNameCollision: 'exported-name-collision',
  redefinedLibraryComponent: 'redefined-library-component',
  newIconAsset: 'new-icon-asset',
  testConsoleOutput: 'test-console-output',
  ...SOURCE_RULE_IDS,
};

/** Per-function structure limits, keyed by the metric name the TypeScript analyzer reports. */
export const FUNCTION_STRUCTURE_LIMITS = {
  lines: { limit: 50, ruleId: RULE_IDS.functionLines },
  statements: { limit: 15, ruleId: RULE_IDS.functionStatements },
  maxControlNesting: { limit: 2, ruleId: RULE_IDS.functionControlNesting },
  parameters: { limit: 3, ruleId: RULE_IDS.functionParameters },
};

export const TEST_TIME_DEFAULTS = { unitTestSeconds: 5, integrationTestSeconds: 30 };

/** Rules `exceptions` can lift for some paths in any preset (TypeScript also takes ESLint rules). */
export const SHARED_EXCEPTION_RULES = [
  RULE_IDS.fileLines,
  RULE_IDS.lineLength,
  RULE_IDS.folderFiles,
  ...HYGIENE_EXCEPTION_RULES,
];

/** `{exception}` is the `exceptions` entry that would lift the finding, as JSON. */
export const EXCEPTION_HINT =
  'If this is intended, add {exception} to "exceptions" in nitpicker.config.json.';

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
  crapScoreLimitCovered:
    '{name} has CRAP {crap} although tests cover it; score must be below {limit}. Reduce its branches: split a branchy part into its own function.',
  crapCoverageUnknown:
    '{name} has unknown coverage and no CRAP score: no test runs it. Add a test that calls it; for inline composition-root wiring, move it to a named function in adapters/ and test that.',
  crapCoverageUnknownJava:
    '{name} has unknown coverage and no CRAP score: JaCoCo has no data for it, so no test runs it or it is annotated @Generated. Add a test that calls it, and remove @Generated from hand-written code.',
  crapCoverageUnknownPlain:
    '{name} has unknown coverage and no CRAP score: no test runs it. Add a test that calls it.',
  changedBranchCoverage: 'Branch coverage is {percent}%; minimum is {minimum}%',
  unusedProp: `Prop {name} is never passed. Remove it, or pass it from a real caller ({scope}). ${EXCEPTION_HINT}`,
  unusedOption: `Option {name} is never set. Remove it, or set it from a real call ({scope}). ${EXCEPTION_HINT}`,
  testOnlyExport: `Export {name} is only imported by tests. Remove \`export\`, or import it from production code. ${EXCEPTION_HINT}`,
  testOnlyReexport: `Export {name} is only imported by tests, and {reexporter} re-exports it, which is not a use. Remove the re-export and \`export\`, or import it from production code. If a host or tool loads {reexporter} instead of importing it, list it in "layout.entryPoints". ${EXCEPTION_HINT}`,
  testOnlyModule: `Module {name} is only imported by tests. Move it to a test-support/ folder, or import it from production code. ${EXCEPTION_HINT}`,
  ...sizeMessages(EXCEPTION_HINT),
  slowTest: `{name} took {seconds} s; {kind} test may take {limit} s. Remove Thread.sleep and other waits, start a smaller Spring context or a test slice{move}. ${EXCEPTION_HINT}`,
  sharedUsedByOneFeature: `{path} is used only by feature {feature}. Move it into {directory}. ${EXCEPTION_HINT}`,
  duplicateDefinition: `{name} is also defined with {same} in {others}. {fix} ${EXCEPTION_HINT}`,
  siblingCopyEdit: `{name} is edited here but not in {others}, where it has almost the same code. Edit it there too, or merge the copies. ${EXCEPTION_HINT}`,
  exportedNameCollision: `{name} is also exported by {others}; {importer} imports both. {fix} ${EXCEPTION_HINT}`,
  redefinedLibraryComponent: `{name} is already rendered from {package} in {count}. Use that one. ${EXCEPTION_HINT}`,
  newIconAsset: `Use an icon from {package} instead of adding {path}. ${EXCEPTION_HINT}`,
  testConsoleOutput: `Tests print new console output: {output}. Fix the cause (for example a timer that outlives the test), or allow a third-party message in "testConsole.allow" of nitpicker.config.json. ${EXCEPTION_HINT}`,
  ...sourceRuleMessages(EXCEPTION_HINT),
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
  ...sizeGrewMessages(EXCEPTION_HINT),
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
  ...SIZE_HELD_MESSAGES,
};

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
  ...couplingRules(RULE_IDS, {
    everyLanguage: withKotlin(ALL, true),
    javaOnly: withKotlin({ typescript: false, java: true, python: false }, true),
  }),
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
  ...UNUSED_API_RULES,
  ...sizeRules({ all: ALL, withKotlin }),
  ...reuseRules(RULE_IDS, withKotlin(TYPESCRIPT_ONLY, false)),
  ...sourceRules(RULE_IDS, withKotlin(TYPESCRIPT_ONLY, false)),
  {
    id: RULE_IDS.slowTest,
    check: 'test-runtime',
    limit: `a test the change adds or edits taking more than ${String(TEST_TIME_DEFAULTS.unitTestSeconds)} s (unit) or ${String(TEST_TIME_DEFAULTS.integrationTestSeconds)} s (integration); override with \`thresholds.unitTestSeconds\` and \`thresholds.integrationTestSeconds\``,
    enforcedBy: withKotlin({ ...ALL, typescript: false }, true),
  },
  ...HYGIENE_RULES,
  testConsoleRule(RULE_IDS, withKotlin(TYPESCRIPT_ONLY, false)),
];

/** Rules of the TypeScript-only structure, coupling, dead-code and test-console checks, lifted by `exceptions`. */
export const TYPESCRIPT_PROJECT_EXCEPTION_RULES = RULES.filter(
  ({ check, enforcedBy }) =>
    ['structure', 'coupling', 'dead-code', 'test-console'].includes(check) &&
    enforcedBy.typescript &&
    !enforcedBy.java &&
    !enforcedBy.python,
).map(({ id }) => id);
