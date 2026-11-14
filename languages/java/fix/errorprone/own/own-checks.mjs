import { REVIEW, SAFE } from '../../../../../core/fix/engine/safety.mjs';
import path from 'node:path';
import { GRADLE_DIRECTORY } from '../../../builds/java-build.mjs';

export const OWN_CHECKS_DIRECTORY = path.join(GRADLE_DIRECTORY, 'errorprone', 'fix-checks');

const PMD = 'pmd';

export const OWN_CHECKS = Object.freeze([
  { check: 'UseStandardCharsets', tool: PMD, safety: SAFE },
  { check: 'SpringComposedMapping', tool: PMD, safety: SAFE },
  { check: 'SpringRestController', tool: PMD, safety: SAFE },
  { check: 'LogStringConcatenation', tool: PMD, safety: SAFE },
  { check: 'UseCollectionIsEmpty', tool: PMD, safety: SAFE },
  { check: 'LiteralsFirstInComparisons', tool: PMD, safety: REVIEW },
  { check: 'PreserveStackTrace', tool: PMD, safety: REVIEW },
  { check: 'SpringConstructorInjection', tool: PMD, safety: REVIEW },
  { check: 'DetachedTestCase', tool: PMD, safety: REVIEW },
  { check: 'RetryInTest', tool: PMD, safety: REVIEW },
  { check: 'MutationIgnoreMarker', tool: PMD, safety: REVIEW },
  { check: 'GeneratedOnHandWrittenCode', tool: PMD, safety: REVIEW },
]);

const BY_CHECK = new Map(OWN_CHECKS.map((entry) => [entry.check, entry]));

export function ownCheck(check) {
  return BY_CHECK.get(check);
}

export function ownChecksOf(safety) {
  return OWN_CHECKS.filter((entry) => entry.safety === safety).map(({ check }) => check);
}

export function ownRule(check) {
  const { tool } = BY_CHECK.get(check);
  return { tool, rule: check };
}

export function usesOwnChecks(checks) {
  return checks.some((check) => BY_CHECK.has(check));
}
