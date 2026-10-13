import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { globToRegExp } from '../../../shared/glob.mjs';
import {
  applyInventoryToFindings,
  readOptionalInventory,
  withLegacyInventory,
} from '../../../shared/legacy-inventory.mjs';
import { evaluateBaselineExpansions } from '../../../shared/rules/baseline-expansion.mjs';

export const EXCEPTION_SEPARATOR = ':';
export const PROJECT_TOOL_CONFIGS = new Map([
  ['pmd', 'config/pmd/ruleset.xml'],
  ['checkstyle', 'config/checkstyle/checkstyle.xml'],
]);

export function configureJavaAnalyzer(
  analyzer,
  { thresholds = {}, exclude = [], exceptions = [], legacyInventory, kotlin = {}, tools = {} },
) {
  const toolArguments = [...PROJECT_TOOL_CONFIGS.keys()]
    .filter((tool) => tools[tool] !== undefined)
    .flatMap((tool) => [`--${tool}-precedence`, tools[tool].precedence.join(',')]);
  if (
    thresholds.crapLimit === undefined &&
    exclude.length === 0 &&
    exceptions.length === 0 &&
    legacyInventory === undefined &&
    kotlin.formatter === undefined &&
    kotlin.detektConfig === undefined &&
    toolArguments.length === 0
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
    ...(kotlin.detektConfig === undefined ? [] : ['--kotlin-detekt-config', kotlin.detektConfig]),
    ...toolArguments,
  ];
  const configurationHash = hashWithArguments(analyzer.configurationHash, adapterArguments);
  const projectConfigs = [...PROJECT_TOOL_CONFIGS]
    .filter(([tool]) => tools[tool]?.precedence.includes('project'))
    .map(([, file]) => file);
  const configured = {
    ...analyzer,
    configurationHash,
    ...(projectConfigs.length === 0
      ? {}
      : {
          resolveConfigurationHash: (policyRoot) =>
            hashWithProjectConfigs(configurationHash, policyRoot, projectConfigs),
        }),
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

function isLifted(finding, lifted) {
  const printedRule = `${finding.tool}/${finding.rule}`;
  return lifted.some(
    ({ rule, matcher }) =>
      (rule === finding.rule || rule === printedRule) && matcher.test(finding.path),
  );
}

function hashWithProjectConfigs(configurationHash, policyRoot, projectConfigs) {
  const hash = createHash('sha256').update(configurationHash);
  for (const file of projectConfigs) {
    const absolute = path.join(policyRoot, file);
    hash.update(`${file}\0`).update(existsSync(absolute) ? readFileSync(absolute) : '');
  }
  return hash.digest('hex');
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
      !excluders.some((matcher) => matcher.test(finding.path)) && !isLifted(finding, lifted),
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
