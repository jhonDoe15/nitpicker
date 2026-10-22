import { DEAD_CODE_RULES, FUNCTION_STRUCTURE_LIMITS, RULE_IDS } from '../policy.mjs';
import { HYGIENE_RULE_IDS, PACKAGE_RULE_IDS } from '../project-rules/hygiene-rules.mjs';
import { SIZE_RULE_IDS } from '../project-rules/size-rules.mjs';

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
  ...STRUCTURE_RULES.map((rule) => [rule, ['structure']]),
  [RULE_IDS.crapScoreLimit, ['crap']],
  [RULE_IDS.crapCoverageUnknown, ['crap']],
  [RULE_IDS.changedBranchCoverage, ['coverage', 'jacoco', 'coverage-py']],
  [RULE_IDS.mutantSurvived, ['mutation', 'pit', 'mutmut']],
  [RULE_IDS.mutantNoCoverage, ['mutation', 'pit', 'mutmut']],
  [RULE_IDS.duplicateClone, ['duplicates']],
  [RULE_IDS.stabilityDirection, ['coupling']],
  ...DEAD_CODE_RULES.map((rule) => [rule, ['dead-code']]),
  ...Object.values(HYGIENE_RULE_IDS).map((rule) => [rule, ['repository-hygiene']]),
  ...Object.values(PACKAGE_RULE_IDS).map((rule) => [rule, ['dead-code']]),
  [RULE_IDS.slowTest, ['test-runtime']],
  [RULE_IDS.noProductionRuntime, ['test-runtime']],
  [RULE_IDS.typeOnlyProductionDependency, ['test-runtime']],
  [RULE_IDS.publicAlternativeBypass, ['entry-points']],
  [RULE_IDS.unusedProp, ['structure']],
  [RULE_IDS.unusedOption, ['structure']],
  [RULE_IDS.testOnlyExport, ['dead-code', 'coupling']],
  [RULE_IDS.sharedUsedByOneFeature, ['coupling']],
  [RULE_IDS.featureInternalImport, ['coupling']],
  [RULE_IDS.sharedImportsFeature, ['coupling']],
  [RULE_IDS.featureCycle, ['coupling']],
  [RULE_IDS.packageCycle, ['coupling']],
  [RULE_IDS.duplicateDefinition, ['structure']],
  [RULE_IDS.siblingCopyEdit, ['structure']],
  [RULE_IDS.exportedNameCollision, ['structure']],
  [RULE_IDS.redefinedLibraryComponent, ['structure']],
  [RULE_IDS.newIconAsset, ['structure']],
  [RULE_IDS.componentStoryMissing, ['structure']],
  [RULE_IDS.javascriptInTypescriptProject, ['structure']],
  ...CODING_STANDARDS_RULES.map((rule) => [rule, ['coding-standards']]),
  ...DEPENDENCY_RULES.map((rule) => [rule, ['dependency-architecture']]),
]);

const PREFIXED_RULE_TOOLS = CODING_STANDARDS_RULE_PREFIXES.map((prefix) => [
  prefix,
  ['coding-standards'],
]);

/** The tools that print `rule` when nitpicker adds it, or undefined. */
export function toolsOf(rule) {
  return (
    RULE_TOOLS.get(rule) ?? PREFIXED_RULE_TOOLS.find(([prefix]) => rule.startsWith(prefix))?.[1]
  );
}

const TYPESCRIPT_TOOLS = [
  'structure',
  'repository-hygiene',
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
];
const SHARED_TOOLS = ['structure', 'test-runtime', 'repository-hygiene'];
const JVM_ANALYZER_TOOLS = [...SHARED_TOOLS, 'crap', 'jacoco', 'pit', 'duplicates', 'coupling'];

/** The tools of each preset that print rules an `exceptions` entry can name. */
export const PRESET_TOOLS = {
  typescript: TYPESCRIPT_TOOLS,
  javascript: TYPESCRIPT_TOOLS,
  java: JVM_ANALYZER_TOOLS,
  kotlin: JVM_ANALYZER_TOOLS,
  python: [...SHARED_TOOLS, 'crap', 'coverage-py', 'mutmut', 'duplicates', 'coupling'],
};
