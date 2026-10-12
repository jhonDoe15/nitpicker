import { createHash } from 'node:crypto';
import { globToRegExp } from '../../../shared/glob.mjs';
import {
  applyInventoryToFindings,
  readOptionalInventory,
  withLegacyInventory,
} from '../../../shared/legacy-inventory.mjs';
import { evaluateBaselineExpansions } from '../../../shared/rules/baseline-expansion.mjs';

export const EXCEPTION_SEPARATOR = ':';

export function configureJavaAnalyzer(
  analyzer,
  { thresholds = {}, exclude = [], exceptions = [], legacyInventory, kotlin = {} },
) {
  if (
    thresholds.crapLimit === undefined &&
    exclude.length === 0 &&
    exceptions.length === 0 &&
    legacyInventory === undefined &&
    kotlin.formatter === undefined
  ) {
    return analyzer;
  }
  const adapterArguments = [
    ...(thresholds.crapLimit === undefined ? [] : ['--crap-limit', String(thresholds.crapLimit)]),
    ...exclude.flatMap((glob) => ['--exclude', glob]),
    ...exceptions.flatMap(({ rule, paths }) =>
      paths.flatMap((glob) => ['--exception', `${rule}${EXCEPTION_SEPARATOR}${glob}`]),
    ),
    ...(kotlin.formatter === undefined ? [] : ['--kotlin-formatter', kotlin.formatter]),
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
      !excluders.some((matcher) => matcher.test(finding.path)) &&
      !lifted.some(({ rule, matcher }) => finding.rule === rule && matcher.test(finding.path)),
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
