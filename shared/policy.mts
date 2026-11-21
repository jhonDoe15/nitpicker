import {
  FILE_RULE_IDS,
  SIZE_HELD_MESSAGES,
  SIZE_RULE_IDS,
  sizeGrewMessages,
  sizeMessages,
  sizeRules,
} from './project-rules/size-rules.mts';
import { UNUSED_API_RULES, UNUSED_API_RULE_IDS } from './unused-api/unused-api-policy.mts';
import { couplingRules, entryPointRule, reuseRules } from './project-rules/reuse-rules.mts';
import {
  GO_NO_TYPE_ONLY,
  NO_TYPE_ONLY,
  slowTest,
  testConsoleRule,
} from './project-rules/test-runtime-rules.mts';
import { BOUNDARY_RULE_IDS, domainRules } from './project-rules/domain/domain-rules.mts';
import {
  docCommentRule,
  SOURCE_RULE_IDS,
  sourceRuleMessages,
  sourceRules,
} from './project-rules/source-rules.mts';
import {
  HISTORY_EXCEPTION_RULES,
  HISTORY_RULES,
  HYGIENE_EXCEPTION_RULES,
  HYGIENE_RULES,
} from './project-rules/hygiene-rules.mts';
import { sharedFactExceptionRules, withLanguageColumns } from './project-rules/fact-rules.mts';
import type { Enforcement, LanguageColumns, RuleEntry } from './project-rules/typed/rule-types.mts';
import { DESIGN_RULE_IDS, designRules } from './project-rules/design/design-rules.mts';

import {
  BASE_GREW_MESSAGES,
  BASE_HELD_MESSAGES,
  BASE_MESSAGES,
  EXCEPTION_HINT,
  allowedForm,
} from './messages/messages.mts';

export { EXCEPTION_HINT, allowedForm, messageFields, renderMessage } from './messages/messages.mts';

export { FILE_LIMIT_DEFAULTS } from './project-rules/size-rules.mts';

export const LANGUAGES: readonly string[] = [
  'typescript',
  'javascript',
  'java',
  'python',
  'kotlin',
  'go',
];

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
  ...BOUNDARY_RULE_IDS,
  duplicateDefinition: 'duplicate-definition',
  siblingCopyEdit: 'sibling-copy-edit',
  nearDuplicate: 'near-duplicate',
  exportedNameCollision: 'exported-name-collision',
  redefinedLibraryComponent: 'redefined-library-component',
  newIconAsset: 'new-icon-asset',
  testConsoleOutput: 'test-console-output',
  docCommentContent: 'doc-comment-content',
  ...SOURCE_RULE_IDS,
  ...DESIGN_RULE_IDS,
};

export const FUNCTION_STRUCTURE_LIMITS = {
  lines: { limit: 50, ruleId: RULE_IDS.functionLines },
  statements: { limit: 15, ruleId: RULE_IDS.functionStatements },
  maxControlNesting: { limit: 2, ruleId: RULE_IDS.functionControlNesting },
  parameters: { limit: 3, ruleId: RULE_IDS.functionParameters },
};

export const FUNCTION_EXCEPTION_RULES = [
  ...Object.values(FUNCTION_STRUCTURE_LIMITS).map(({ ruleId }) => ruleId),
  RULE_IDS.crapScoreLimit,
  RULE_IDS.crapCoverageUnknown,
  RULE_IDS.changedBranchCoverage,
  RULE_IDS.mutantSurvived,
  RULE_IDS.mutantNoCoverage,
];

export const FUNCTION_REQUIRED_RULES = [RULE_IDS.changedBranchCoverage];

export const DEAD_CODE_RULES = ['files', 'exports', 'types'];

export const NAME_EXCEPTION_RULES = ['exports', 'types'];

export const TEST_TIME_DEFAULTS = { unitTestSeconds: 5, integrationTestSeconds: 30 };

const FILE_EXCEPTION_RULES = [
  RULE_IDS.fileLines,
  RULE_IDS.lineLength,
  RULE_IDS.folderFiles,
  RULE_IDS.slowTest,
  ...HYGIENE_EXCEPTION_RULES,
  ...HISTORY_EXCEPTION_RULES,
  ...sharedFactExceptionRules(),
];

const PATH_EXCEPTION_RULES = [
  RULE_IDS.duplicateClone,
  RULE_IDS.stabilityDirection,
  RULE_IDS.packageCycle,
  RULE_IDS.noProductionRuntime,
  ...FILE_EXCEPTION_RULES,
];

export const COMMON_EXCEPTION_RULES = [...FUNCTION_EXCEPTION_RULES, ...FILE_EXCEPTION_RULES];

export const TEST_RUN_EXCEPTION_RULES = [RULE_IDS.slowTest];

export const MUTATION_EXCEPTION_RULES = [
  'mutant-ignored',
  RULE_IDS.mutantSurvived,
  RULE_IDS.mutantNoCoverage,
];

export const SHARED_EXCEPTION_RULES = [...FUNCTION_EXCEPTION_RULES, ...PATH_EXCEPTION_RULES];

export const DEFAULT_CRAP_SCORE_LIMIT = 9;

export const MINIMUM_BRANCH_COVERAGE = 95;

export const DUPLICATES_MODE = 'mild';

export const ENFORCED_MUTATION_STATUSES = ['Survived', 'NoCoverage'];

export function mutantRuleId(status: string): string {
  return `mutant-${status.toLowerCase()}`;
}

export const TOUCHED_CODE_RULES = [
  { rule: RULE_IDS.changedBranchCoverage, tools: ['jacoco'] },
  { rule: RULE_IDS.changedBranchCoverage, tools: ['coverage-py'] },
];

export const MESSAGES = {
  ...BASE_MESSAGES,
  ...sizeMessages(EXCEPTION_HINT, allowedForm),
  ...sourceRuleMessages(EXCEPTION_HINT, allowedForm),
};

export const GREW_MESSAGES = {
  ...BASE_GREW_MESSAGES,
  ...sizeGrewMessages(EXCEPTION_HINT, allowedForm),
};

export const HELD_MESSAGES = { ...BASE_HELD_MESSAGES, ...SIZE_HELD_MESSAGES };

const STRUCTURE_CHECK = 'structure';
const ALL: LanguageColumns = { typescript: true, java: true, python: true };
const TYPESCRIPT_ONLY: LanguageColumns = { typescript: true, java: false, python: false };
function withKotlin(enforcedBy: LanguageColumns, kotlin: boolean): LanguageColumns {
  return { ...enforcedBy, kotlin };
}

function withGo(enforcedBy: LanguageColumns): LanguageColumns {
  return { ...enforcedBy, go: true };
}

const CATALOG: RuleEntry[] = [
  {
    id: RULE_IDS.functionLines,
    check: STRUCTURE_CHECK,
    limit: `more than ${String(FUNCTION_STRUCTURE_LIMITS.lines.limit)} lines`,
    enforcedBy: withGo(withKotlin(ALL, true)),
  },
  {
    id: RULE_IDS.functionStatements,
    check: STRUCTURE_CHECK,
    limit: `more than ${String(FUNCTION_STRUCTURE_LIMITS.statements.limit)} statements`,
    enforcedBy: withGo(withKotlin(ALL, true)),
  },
  {
    id: RULE_IDS.functionControlNesting,
    check: STRUCTURE_CHECK,
    limit: `control nesting deeper than ${String(FUNCTION_STRUCTURE_LIMITS.maxControlNesting.limit)}`,
    enforcedBy: withGo(withKotlin(ALL, true)),
  },
  {
    id: RULE_IDS.functionParameters,
    check: STRUCTURE_CHECK,
    limit: `more than ${String(FUNCTION_STRUCTURE_LIMITS.parameters.limit)} parameters`,
    enforcedBy: withGo(withKotlin(ALL, true)),
  },
  {
    id: RULE_IDS.crapScoreLimit,
    check: 'crap',
    limit: `CRAP score at or above ${String(DEFAULT_CRAP_SCORE_LIMIT)}; override with \`thresholds.crapLimit\` (positive number)`,
    enforcedBy: withGo(withKotlin(ALL, true)),
  },
  {
    id: RULE_IDS.crapCoverageUnknown,
    check: 'crap',
    limit: 'function with unknown coverage and no CRAP score',
    enforcedBy: withGo(withKotlin(ALL, true)),
  },
  {
    id: RULE_IDS.changedBranchCoverage,
    check: 'coverage',
    limit: `a changed branch with coverage below ${String(MINIMUM_BRANCH_COVERAGE)}%`,
    enforcedBy: withGo(withKotlin(ALL, true)),
  },
  {
    id: RULE_IDS.mutantSurvived,
    check: 'mutation',
    limit: 'no score gate (`thresholds.break` is `null`); each new surviving mutant fails',
    enforcedBy: withGo(withKotlin(ALL, true)),
  },
  {
    id: RULE_IDS.mutantNoCoverage,
    check: 'mutation',
    limit: 'no score gate (`thresholds.break` is `null`); each new uncovered mutant fails',
    enforcedBy: withGo(withKotlin(ALL, true)),
  },
  {
    id: RULE_IDS.duplicateClone,
    check: 'duplicates',
    limit: `jscpd in \`${DUPLICATES_MODE}\` mode, also over sources with names and literals normalized (at least 100 tokens, except code that only repeats one or two statements); any new clone fails`,
    enforcedBy: withGo(withKotlin(ALL, true)),
  },
  ...couplingRules(RULE_IDS, {
    everyLanguage: withGo(withKotlin(ALL, true)),
    withoutGo: withKotlin(ALL, true),
  }),
  {
    id: RULE_IDS.noProductionRuntime,
    check: 'test-runtime',
    limit:
      'a test file (Java and Kotlin: a test class) that runs no production code: nothing it imports or references, directly or through test helpers, is production code, and it starts no production process or framework context',
    enforcedBy: withGo(withKotlin(ALL, true)),
  },
  {
    id: RULE_IDS.typeOnlyProductionDependency,
    check: 'test-runtime',
    limit:
      'a test file whose only link to production code is imports that exist only for the type checker (`import type`, `if TYPE_CHECKING:`)',
    enforcedBy: withKotlin({ ...TYPESCRIPT_ONLY, python: true }, false),
    notApplicable: { java: NO_TYPE_ONLY, kotlin: NO_TYPE_ONLY, go: GO_NO_TYPE_ONLY },
  },
  {
    id: RULE_IDS.baselineExpansion,
    check: 'coding-standards',
    limit: 'raising a legacy baseline allowance fails',
    enforcedBy: withGo(withKotlin(ALL, true)),
  },
  entryPointRule(RULE_IDS, withGo(withKotlin(TYPESCRIPT_ONLY, false))),
  ...UNUSED_API_RULES,
  ...sizeRules({ all: ALL, withKotlin, withGo }),
  ...reuseRules(RULE_IDS, withKotlin(TYPESCRIPT_ONLY, false)),
  ...domainRules(RULE_IDS),
  ...sourceRules(RULE_IDS, withKotlin(TYPESCRIPT_ONLY, false)),
  slowTest(RULE_IDS, TEST_TIME_DEFAULTS, withGo(withKotlin(ALL, true))),
  ...HYGIENE_RULES,
  ...HISTORY_RULES,
  testConsoleRule(RULE_IDS),
  docCommentRule(RULE_IDS),
  ...designRules(DESIGN_RULE_IDS),
];

function isEnforced(column: Enforcement | undefined): boolean {
  return column !== undefined && column !== false;
}

export const RULES = CATALOG.map((rule) => withLanguageColumns(rule, LANGUAGES));

export const TYPESCRIPT_PROJECT_EXCEPTION_RULES = RULES.filter(
  ({ check, enforcedBy }) =>
    [STRUCTURE_CHECK, 'coupling', 'dead-code', 'test-console'].includes(check) &&
    isEnforced(enforcedBy['typescript']) &&
    !isEnforced(enforcedBy['java']) &&
    !isEnforced(enforcedBy['python']),
).map(({ id }) => id);
