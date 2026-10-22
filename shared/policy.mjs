import {
  FILE_RULE_IDS,
  SIZE_HELD_MESSAGES,
  SIZE_RULE_IDS,
  sizeGrewMessages,
  sizeMessages,
  sizeRules,
} from './project-rules/size-rules.mjs';
import { UNUSED_API_RULES, UNUSED_API_RULE_IDS } from './unused-api/unused-api-policy.mjs';
import { couplingRules, reuseRules } from './project-rules/reuse-rules.mjs';
import { testConsoleRule } from './project-rules/test-runtime-rules.mjs';
import {
  docCommentRule,
  SOURCE_RULE_IDS,
  sourceRuleMessages,
  sourceRules,
} from './project-rules/source-rules.mjs';
import { HYGIENE_EXCEPTION_RULES, HYGIENE_RULES } from './project-rules/hygiene-rules.mjs';
import { sharedFactExceptionRules, withLanguageColumns } from './project-rules/fact-rules.mjs';

import {
  BASE_GREW_MESSAGES,
  BASE_HELD_MESSAGES,
  BASE_MESSAGES,
  EXCEPTION_HINT,
} from './messages/messages.mjs';

export { EXCEPTION_HINT, renderMessage } from './messages/messages.mjs';

export { FILE_LIMIT_DEFAULTS } from './project-rules/size-rules.mjs';

export const LANGUAGES = ['typescript', 'javascript', 'java', 'python', 'kotlin'];

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
  docCommentContent: 'doc-comment-content',
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
  RULE_IDS.slowTest,
  ...HYGIENE_EXCEPTION_RULES,
  ...sharedFactExceptionRules(),
];

export const TEST_RUN_EXCEPTION_RULES = [RULE_IDS.slowTest];

export const MUTATION_EXCEPTION_RULES = [
  'mutant-ignored',
  RULE_IDS.mutantSurvived,
  RULE_IDS.mutantNoCoverage,
];

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

export const MESSAGES = {
  ...BASE_MESSAGES,
  ...sizeMessages(EXCEPTION_HINT),
  ...sourceRuleMessages(EXCEPTION_HINT),
};

export const GREW_MESSAGES = { ...BASE_GREW_MESSAGES, ...sizeGrewMessages(EXCEPTION_HINT) };

export const HELD_MESSAGES = { ...BASE_HELD_MESSAGES, ...SIZE_HELD_MESSAGES };

const ALL = { typescript: true, java: true, python: true };
const TYPESCRIPT_ONLY = { typescript: true, java: false, python: false };
const withKotlin = (enforcedBy, kotlin) => ({ ...enforcedBy, kotlin });

const CATALOG = [
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
    enforcedBy: withKotlin(ALL, true),
  },
  ...HYGIENE_RULES,
  testConsoleRule(RULE_IDS),
  docCommentRule(RULE_IDS),
];

export const RULES = CATALOG.map((rule) => withLanguageColumns(rule, LANGUAGES));

/** Rules of the TypeScript-only structure, coupling, dead-code and test-console checks, lifted by `exceptions`. */
export const TYPESCRIPT_PROJECT_EXCEPTION_RULES = RULES.filter(
  ({ check, enforcedBy }) =>
    ['structure', 'coupling', 'dead-code', 'test-console'].includes(check) &&
    enforcedBy.typescript &&
    !enforcedBy.java &&
    !enforcedBy.python,
).map(({ id }) => id);
