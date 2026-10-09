import { createHash } from 'node:crypto';
import { globToRegExp } from '../../shared/glob.mjs';
import {
  applyInventoryToFindings,
  normalizeBaselineExpansions,
  readOptionalInventory,
  withLegacyInventory,
} from '../../shared/legacy-inventory.mjs';

// The project config as the Java preset honours it. The shared config layer (`thresholds`,
// `exclude`, `legacyInventory`) reaches the Java analyzer as runner arguments, so they are part
// of the analyzer's configuration hash; the runner applies them to the findings it collects:
//  - `thresholds.crapLimit` is the CRAP limit handed to the CRAP ingester;
//  - `exclude` drops findings whose path matches a glob (the tools still run on those files);
//  - `legacyInventory` baselines existing sites: the inventory's `{ file, rule, source, count }`
//    entries match findings by path, rule id and identity, and up to `count` occurrences of each
//    are allowed. Head fails with `baseline-expansion` when it raises an allowance over base.

const INVENTORY_TOOL = 'java';

/** Wraps the Java analyzer so the config's thresholds, exclude and inventory reach its runner. */
export function configureJavaAnalyzer(
  analyzer,
  { thresholds = {}, exclude = [], legacyInventory },
) {
  if (thresholds.crapLimit === undefined && exclude.length === 0 && legacyInventory === undefined) {
    return analyzer;
  }
  const adapterArguments = [
    ...(thresholds.crapLimit === undefined ? [] : ['--crap-limit', String(thresholds.crapLimit)]),
    ...exclude.flatMap((glob) => ['--exclude', glob]),
  ];
  const configured = {
    ...analyzer,
    configurationHash: hashWithArguments(analyzer.configurationHash, adapterArguments),
    createInvocation: (context) => {
      const invocation = analyzer.createInvocation(context);
      return {
        ...invocation,
        args: [
          ...invocation.args,
          ...adapterArguments,
          '--snapshot',
          context.snapshot ?? 'head',
          ...(context.projectPolicyRoot === undefined
            ? []
            : ['--policy-root', context.projectPolicyRoot]),
          ...(context.baselineRoot === undefined ? [] : ['--baseline-root', context.baselineRoot]),
        ],
      };
    },
  };
  return legacyInventory === undefined
    ? configured
    : withLegacyInventory(configured, legacyInventory);
}

function hashWithArguments(configurationHash, adapterArguments) {
  return adapterArguments.length === 0
    ? configurationHash
    : createHash('sha256')
        .update(configurationHash)
        .update(JSON.stringify(adapterArguments))
        .digest('hex');
}

/** Applies `exclude` and the legacy inventory to one snapshot's findings. */
export function applyJavaPolicy(
  findings,
  { exclude = [], legacyInventory, policyRoot, baselineRoot, snapshot = 'head' } = {},
) {
  const excluders = exclude.map((glob) => globToRegExp(glob));
  const kept = findings.filter(
    (finding) => !excluders.some((matcher) => matcher.test(finding.path)),
  );
  if (legacyInventory === undefined || policyRoot === undefined) {
    return kept;
  }
  // Base and head are both read against the head's inventory, so a base tree cannot choose its
  // own allowances.
  const headInventory = readOptionalInventory(policyRoot, legacyInventory);
  const baselined = applyInventoryToFindings(kept, headInventory.sites);
  if (snapshot !== 'head' || baselineRoot === undefined) {
    return baselined;
  }
  const baseInventory = readOptionalInventory(baselineRoot, legacyInventory);
  return [
    ...baselined,
    ...normalizeBaselineExpansions(baseInventory.sites, headInventory.sites, INVENTORY_TOOL),
  ];
}
