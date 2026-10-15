import { globToRegExp } from '../glob.mjs';
import { applyInventoryToFindings, readOptionalInventory } from '../legacy-inventory.mjs';
import { evaluateBaselineExpansions } from '../rules/baseline-expansion.mjs';
import { clonePartnerPath } from '../rules/duplicates.mjs';

export function findingPaths(finding) {
  const partner = clonePartnerPath(finding);
  return partner === undefined ? [finding.path] : [finding.path, partner];
}

function isLifted(finding, lifted) {
  const printedRule = `${finding.tool}/${finding.rule}`;
  return lifted.some(
    ({ rule, matcher }) =>
      (rule === finding.rule || rule === printedRule) && matchesAny(matcher, finding),
  );
}

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
  } = {},
) {
  const excluders = exclude.map((glob) => globToRegExp(glob));
  const lifted = exceptions.map(({ rule, glob }) => ({ rule, matcher: globToRegExp(glob) }));
  const kept = findings.filter(
    (finding) =>
      !excluders.some((matcher) => matchesAny(matcher, finding)) && !isLifted(finding, lifted),
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
