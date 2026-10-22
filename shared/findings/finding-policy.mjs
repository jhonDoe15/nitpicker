import { globMatcher } from '../paths/glob.mjs';
import { applyFindingExceptions } from '../exceptions/finding-exceptions.mjs';
import { sharedRouteRule, withExceptionRoutes } from '../exceptions/routes.mjs';
import { applyInventoryToFindings, readOptionalInventory } from '../legacy-inventory.mjs';
import { evaluateBaselineExpansions } from '../rules/baseline-expansion.mjs';
import { findingPaths } from './finding-paths.mjs';

export { findingPaths };

function matchesAny(matcher, finding) {
  return findingPaths(finding).some((candidate) => matcher.test(candidate));
}

export function applyFindingPolicy(
  findings,
  {
    exclude = [],
    exceptions = [],
    legacyInventory,
    policyRoot,
    baselineRoot,
    snapshot = 'head',
    inventoryTool,
    routeRule = sharedRouteRule,
  } = {},
  resolveOverlaps = (reported) => reported,
) {
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
