import { createHash } from 'node:crypto';
import { globToRegExp } from '../../../shared/glob.mjs';
import {
  applyInventoryToFindings,
  readOptionalInventory,
  withLegacyInventory,
} from '../../../shared/legacy-inventory.mjs';
import { evaluateBaselineExpansions } from '../../../shared/rules/baseline-expansion.mjs';

const INVENTORY_TOOL = 'java';

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
  const headInventory = readOptionalInventory(policyRoot, legacyInventory);
  const baselined = applyInventoryToFindings(kept, headInventory.sites);
  if (snapshot !== 'head' || baselineRoot === undefined) {
    return baselined;
  }
  const baseInventory = readOptionalInventory(baselineRoot, legacyInventory);
  return [
    ...baselined,
    ...evaluateBaselineExpansions(baseInventory.sites, headInventory.sites, INVENTORY_TOOL),
  ];
}
