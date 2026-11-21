import { globMatcher } from '../paths/glob.mts';
import { applyFindingExceptions } from '../exceptions/finding-exceptions.mts';
import { findingPaths } from '../exceptions/matching.mts';
import { sharedRouteRule, withExceptionRoutes } from '../exceptions/routes.mts';
import { applyInventoryToFindings, readOptionalInventory } from '../legacy-inventory.mts';
import { evaluateBaselineExpansions } from '../rules/baseline-expansion.mts';
import type { MatchedFinding } from '../exceptions/matching.mts';
import type { RoutedFinding } from '../exceptions/routes.mts';
import type { Finding as ExpansionFinding } from '../values/findings.mts';

type PolicyFinding = RoutedFinding & MatchedFinding;
type ExceptionEntries = Parameters<typeof applyFindingExceptions>[1];
type RouteRule<Finding> = ((finding: Finding) => string | undefined) | readonly string[];
type PolicyOptions<Finding> = {
  readonly exclude?: readonly string[];
  readonly exceptions?: ExceptionEntries;
  readonly legacyInventory?: string | undefined;
  readonly policyRoot?: string | undefined;
  readonly baselineRoot?: string | undefined;
  readonly snapshot?: string;
  readonly inventoryTool?: string | undefined;
  readonly routeRule?: RouteRule<Finding>;
};

function matchesAny(matcher: { test(path: string): boolean }, finding: MatchedFinding): boolean {
  return findingPaths(finding).some((candidate) => matcher.test(candidate));
}

export function applyFindingPolicy<Finding extends PolicyFinding>(
  findings: readonly Finding[],
  {
    exclude = [],
    exceptions = [],
    legacyInventory,
    policyRoot,
    baselineRoot,
    snapshot = 'head',
    inventoryTool,
    routeRule = sharedRouteRule,
  }: PolicyOptions<Finding> = {},
  resolveOverlaps: (reported: readonly Finding[]) => readonly Finding[] = (reported) => reported,
): readonly (Finding | ExpansionFinding)[] {
  const excluders = exclude.map((glob) => globMatcher(glob));
  const kept = resolveOverlaps(
    applyFindingExceptions(
      withExceptionRoutes(
        findings.filter((finding) => !excluders.some((matcher) => matchesAny(matcher, finding))),
        routeRule,
      ),
      exceptions,
    ),
  );
  if (legacyInventory === undefined || policyRoot === undefined) {
    return kept;
  }
  if (inventoryTool === undefined) {
    throw new TypeError('applyFindingPolicy needs "inventoryTool" to apply a legacy inventory');
  }
  const headInventory = readOptionalInventory(policyRoot, legacyInventory);
  const baselined = applyInventoryToFindings(kept, headInventory.sites);
  if (snapshot !== 'head' || baselineRoot === undefined) {
    return baselined;
  }
  const baseInventory = readOptionalInventory(baselineRoot, legacyInventory);
  return [
    ...baselined,
    ...evaluateBaselineExpansions(baseInventory.sites, headInventory.sites, inventoryTool),
  ];
}
