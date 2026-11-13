import { DEAD_CODE_RULES, FUNCTION_STRUCTURE_LIMITS, RULE_IDS } from '../policy.mjs';
import {
  CHANGE_HISTORY_TOOL,
  HISTORY_RULE_IDS,
  HYGIENE_RULE_IDS,
  PACKAGE_RULE_IDS,
} from '../project-rules/hygiene-rules.mjs';
import { SIZE_RULE_IDS } from '../project-rules/size-rules.mjs';
import { DOMAIN_RULE_IDS } from '../project-rules/domain/domain-rules.mjs';

const STRUCTURE_TOOL = 'structure';
const MUTATION_TOOL = 'mutation';
const MUTMUT_TOOL = 'mutmut';
const DUPLICATES_TOOL = 'duplicates';
const DEAD_CODE_TOOL = 'dead-code';
const FACTS_TOOL = 'facts';
const CODING_STANDARDS_TOOL = 'coding-standards';
const COUPLING_TOOL = 'coupling';
const TEST_RUNTIME_TOOL = 'test-runtime';
const REPOSITORY_HYGIENE_TOOL = 'repository-hygiene';

const STRUCTURE_RULES = [
  ...Object.values(FUNCTION_STRUCTURE_LIMITS).map(({ ruleId }) => ruleId),
  ...Object.values(SIZE_RULE_IDS),
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
  'domain-does-not-import-id-libraries',
  'domain-does-not-reach-io-through-shared',
];

const RULE_TOOLS = new Map([
  ...STRUCTURE_RULES.map((rule) => [rule, [STRUCTURE_TOOL]]),
  [RULE_IDS.crapScoreLimit, ['crap']],
  [RULE_IDS.crapCoverageUnknown, ['crap']],
  [RULE_IDS.changedBranchCoverage, ['coverage', 'jacoco', 'coverage-py']],
  [RULE_IDS.mutantSurvived, [MUTATION_TOOL, 'pit', MUTMUT_TOOL]],
  [RULE_IDS.mutantNoCoverage, [MUTATION_TOOL, 'pit', MUTMUT_TOOL]],
  [RULE_IDS.duplicateClone, [DUPLICATES_TOOL]],
  [RULE_IDS.stabilityDirection, [COUPLING_TOOL]],
  ...DEAD_CODE_RULES.map((rule) => [rule, [DEAD_CODE_TOOL]]),
  ...Object.values(HYGIENE_RULE_IDS).map((rule) => [rule, [REPOSITORY_HYGIENE_TOOL]]),
  ...Object.values(HISTORY_RULE_IDS).map((rule) => [rule, [CHANGE_HISTORY_TOOL]]),
  ...Object.values(PACKAGE_RULE_IDS).map((rule) => [rule, [DEAD_CODE_TOOL]]),
  [RULE_IDS.slowTest, [TEST_RUNTIME_TOOL]],
  [RULE_IDS.noProductionRuntime, [TEST_RUNTIME_TOOL]],
  [RULE_IDS.typeOnlyProductionDependency, [TEST_RUNTIME_TOOL]],
  [RULE_IDS.publicAlternativeBypass, ['entry-points']],
  [RULE_IDS.unusedProp, [STRUCTURE_TOOL]],
  [RULE_IDS.unusedOption, [STRUCTURE_TOOL]],
  [RULE_IDS.testOnlyExport, [DEAD_CODE_TOOL, COUPLING_TOOL]],
  [RULE_IDS.sharedUsedByOneFeature, [COUPLING_TOOL]],
  [RULE_IDS.featureInternalImport, [COUPLING_TOOL]],
  [RULE_IDS.sharedImportsFeature, [COUPLING_TOOL]],
  [RULE_IDS.featureCycle, [COUPLING_TOOL]],
  [RULE_IDS.packageCycle, [COUPLING_TOOL]],
  [RULE_IDS.foreignFeaturePersistence, [COUPLING_TOOL, STRUCTURE_TOOL]],
  ...Object.values(DOMAIN_RULE_IDS).map((rule) => [rule, [COUPLING_TOOL]]),
  [RULE_IDS.duplicateDefinition, [STRUCTURE_TOOL]],
  [RULE_IDS.siblingCopyEdit, [STRUCTURE_TOOL]],
  [RULE_IDS.nearDuplicate, [STRUCTURE_TOOL]],
  [RULE_IDS.decidedCondition, [STRUCTURE_TOOL]],
  [RULE_IDS.duplicateBranch, [STRUCTURE_TOOL]],
  [RULE_IDS.exportedNameCollision, [STRUCTURE_TOOL]],
  [RULE_IDS.redefinedLibraryComponent, [STRUCTURE_TOOL]],
  [RULE_IDS.newIconAsset, [STRUCTURE_TOOL]],
  [RULE_IDS.componentStoryMissing, [STRUCTURE_TOOL]],
  [RULE_IDS.javascriptInTypescriptProject, [STRUCTURE_TOOL]],
  [RULE_IDS.docCommentContent, [FACTS_TOOL]],
  ...CODING_STANDARDS_RULES.map((rule) => [rule, [CODING_STANDARDS_TOOL]]),
  ...DEPENDENCY_RULES.map((rule) => [rule, ['dependency-architecture']]),
]);

const PREFIXED_RULE_TOOLS = CODING_STANDARDS_RULE_PREFIXES.map((prefix) => [
  prefix,
  [CODING_STANDARDS_TOOL],
]);

/** The tools that print `rule` when nitpicker adds it, or undefined. */
export function toolsOf(rule) {
  return (
    RULE_TOOLS.get(rule) ?? PREFIXED_RULE_TOOLS.find(([prefix]) => rule.startsWith(prefix))?.[1]
  );
}

const TYPESCRIPT_TOOLS = [
  STRUCTURE_TOOL,
  REPOSITORY_HYGIENE_TOOL,
  CHANGE_HISTORY_TOOL,
  'crap',
  'coverage',
  MUTATION_TOOL,
  DUPLICATES_TOOL,
  COUPLING_TOOL,
  DEAD_CODE_TOOL,
  TEST_RUNTIME_TOOL,
  'entry-points',
  CODING_STANDARDS_TOOL,
  'dependency-architecture',
];
const SHARED_TOOLS = [
  STRUCTURE_TOOL,
  TEST_RUNTIME_TOOL,
  REPOSITORY_HYGIENE_TOOL,
  CHANGE_HISTORY_TOOL,
];
const JVM_ANALYZER_TOOLS = [
  ...SHARED_TOOLS,
  'crap',
  'jacoco',
  'pit',
  DUPLICATES_TOOL,
  COUPLING_TOOL,
  FACTS_TOOL,
];

/** The tools of each preset that print rules an `exceptions` entry can name. */
export const PRESET_TOOLS = {
  typescript: TYPESCRIPT_TOOLS,
  javascript: TYPESCRIPT_TOOLS,
  java: JVM_ANALYZER_TOOLS,
  kotlin: JVM_ANALYZER_TOOLS,
  python: [
    ...SHARED_TOOLS,
    'crap',
    'coverage-py',
    MUTMUT_TOOL,
    DUPLICATES_TOOL,
    COUPLING_TOOL,
    FACTS_TOOL,
  ],
  go: [...SHARED_TOOLS, FACTS_TOOL],
};
