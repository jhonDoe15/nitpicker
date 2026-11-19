import { REVIEW, SAFE } from '../../../../../core/fix/engine/safety.mjs';
import path from 'node:path';
import { GRADLE_DIRECTORY as untypedGradleDirectory } from '../../../builds/java-build.mjs';
import type { RuleRef } from '../../../../../core/fix/typed/fix-types.mts';

type OwnCheck = { readonly check: string; readonly tool: string; readonly safety: string };

const GRADLE_DIRECTORY: string = untypedGradleDirectory;

export const OWN_CHECKS_DIRECTORY = path.join(GRADLE_DIRECTORY, 'errorprone', 'fix-checks');

const PMD = 'pmd';
const EFFECTS = 'effects';
const SPOTBUGS = 'spotbugs';

export const OWN_CHECKS: readonly OwnCheck[] = Object.freeze([
  { check: 'UseStandardCharsets', tool: PMD, safety: SAFE },
  { check: 'SpringComposedMapping', tool: PMD, safety: SAFE },
  { check: 'SpringRestController', tool: PMD, safety: SAFE },
  { check: 'LogStringConcatenation', tool: PMD, safety: SAFE },
  { check: 'UseCollectionIsEmpty', tool: PMD, safety: SAFE },
  { check: 'DMI_RANDOM_USED_ONLY_ONCE', tool: SPOTBUGS, safety: SAFE },
  { check: 'UseEnumCollections', tool: PMD, safety: REVIEW },
  { check: 'SortForExtreme', tool: PMD, safety: REVIEW },
  { check: 'PlainTextRegex', tool: PMD, safety: REVIEW },
  { check: 'DoNotCallGarbageCollectionExplicitly', tool: PMD, safety: REVIEW },
  { check: 'SimplifyBooleanReturns', tool: PMD, safety: SAFE },
  { check: 'SimplifiedTernary', tool: PMD, safety: SAFE },
  { check: 'SimplifyBooleanExpressions', tool: PMD, safety: SAFE },
  { check: 'CollapsibleIfStatements', tool: PMD, safety: SAFE },
  { check: 'UselessStringValueOf', tool: PMD, safety: SAFE },
  { check: 'LiteralsFirstInComparisons', tool: PMD, safety: REVIEW },
  { check: 'PreserveStackTrace', tool: PMD, safety: REVIEW },
  { check: 'SpringConstructorInjection', tool: PMD, safety: REVIEW },
  { check: 'DetachedTestCase', tool: PMD, safety: REVIEW },
  { check: 'RetryInTest', tool: PMD, safety: REVIEW },
  { check: 'MutationIgnoreMarker', tool: PMD, safety: REVIEW },
  { check: 'GeneratedOnHandWrittenCode', tool: PMD, safety: REVIEW },
  { check: 'SpringDataNoSaveInLoop', tool: PMD, safety: REVIEW },
  { check: 'SpringDataBatchOfOne', tool: PMD, safety: REVIEW },
  { check: 'EntityLoadedForExistence', tool: EFFECTS, safety: REVIEW },
  { check: 'ListUsedAsSet', tool: PMD, safety: REVIEW },
  { check: 'LinearLookupInLoop', tool: PMD, safety: REVIEW },
  { check: 'ReusableObjectPerCall', tool: PMD, safety: REVIEW },
  { check: 'IIL_PREPARE_STATEMENT_IN_LOOP', tool: 'spotbugs', safety: REVIEW },
]);

const BY_CHECK = new Map(OWN_CHECKS.map((entry) => [entry.check, entry]));

export function ownCheck(check: string): OwnCheck | undefined {
  return BY_CHECK.get(check);
}

export function ownChecksOf(safety: string): string[] {
  return OWN_CHECKS.filter((entry) => entry.safety === safety).map(({ check }) => check);
}

export function ownRule(check: string): RuleRef {
  const entry = BY_CHECK.get(check);
  if (entry === undefined) {
    throw new TypeError(`${check} is not an own check`);
  }
  return { tool: entry.tool, rule: check };
}

export function usesOwnChecks(checks: readonly string[]): boolean {
  return checks.some((check) => BY_CHECK.has(check));
}
