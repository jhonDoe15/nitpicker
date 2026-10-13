import { globToRegExp } from './glob.mjs';
import { applyInventoryToFindings, readOptionalInventory } from './legacy-inventory.mjs';
import { evaluateBaselineExpansions } from './rules/baseline-expansion.mjs';
import { clonePartnerPath } from './rules/duplicates.mjs';

export function findingPaths(finding) {
  const partner = clonePartnerPath(finding);
  return partner === undefined ? [finding.path] : [finding.path, partner];
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
    preset = 'java',
    inventoryTool = preset,
  } = {},
) {
  const excluders = exclude.map((glob) => globToRegExp(glob));
  const lifted = exceptions.map(({ rule, glob }) => ({ rule, matcher: globToRegExp(glob) }));
  const kept = findings.filter(
    (finding) =>
      !excluders.some((matcher) => matchesAny(matcher, finding)) &&
      !lifted.some(({ rule, matcher }) => finding.rule === rule && matchesAny(matcher, finding)),
  );
  if (legacyInventory === undefined || policyRoot === undefined) {
    return kept;
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
