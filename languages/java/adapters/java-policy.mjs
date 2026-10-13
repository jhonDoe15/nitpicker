import { createHash } from 'node:crypto';
import { globToRegExp } from '../../../shared/glob.mjs';
import {
  applyInventoryToFindings,
  readOptionalInventory,
  withLegacyInventory,
} from '../../../shared/legacy-inventory.mjs';
import { configError, liftsOnlyRules } from '../../../shared/config.mjs';
import { JAVA_NATIVE_RULES, SHARED_EXCEPTION_RULES } from '../../../shared/policy.mjs';
import { evaluateBaselineExpansions } from '../../../shared/rules/baseline-expansion.mjs';

export const EXCEPTION_SEPARATOR = ':';
const FILE_LIMIT_THRESHOLDS = ['fileLines', 'testFileLines', 'lineLength', 'folderFiles'];
const TYPESCRIPT_ONLY_KEYS = ['layout', 'exceptions', 'react', 'tools'];
const JAVA_EXCEPTION_RULES = SHARED_EXCEPTION_RULES.filter(
  (rule) => !JAVA_NATIVE_RULES.includes(rule),
);

export function validateJavaConfig(config) {
  const unsupported = TYPESCRIPT_ONLY_KEYS.filter(
    (key) => config[key] !== undefined && !isLiftedKey(config, key),
  );
  if (unsupported.length > 0) {
    throw configError(
      `"${unsupported[0]}" is not supported with "preset": "${config.preset}": it describes the TypeScript source layout and ESLint rules, which the ${config.preset} preset does not have. Not supported with ${config.preset}: ${TYPESCRIPT_ONLY_KEYS.join(', ')}, except exceptions for ${JAVA_EXCEPTION_RULES.join(', ')}. Shared by all presets: thresholds, exclude, legacyInventory`,
    );
  }
  if (config.preset === 'java' && config.thresholds?.lineLength !== undefined) {
    throw configError(
      '"thresholds.lineLength" is not supported with "preset": "java": Checkstyle checks Java line length; set it in config/checkstyle/checkstyle.xml',
    );
  }
}

function isLiftedKey(config, key) {
  return (
    key === 'exceptions' &&
    (config.preset === 'kotlin' || liftsOnlyRules(config.exceptions, JAVA_EXCEPTION_RULES))
  );
}

export function configureJavaAnalyzer(
  analyzer,
  { thresholds = {}, exclude = [], exceptions = [], legacyInventory, kotlin = {} },
) {
  const fileLimits = fileLimitThresholds(thresholds);
  if (
    fileLimits === undefined &&
    thresholds.crapLimit === undefined &&
    exclude.length === 0 &&
    exceptions.length === 0 &&
    legacyInventory === undefined &&
    kotlin.formatter === undefined &&
    kotlin.detektConfig === undefined
  ) {
    return analyzer;
  }
  const adapterArguments = [
    ...(thresholds.crapLimit === undefined ? [] : ['--crap-limit', String(thresholds.crapLimit)]),
    ...exclude.flatMap((glob) => ['--exclude', glob]),
    ...(fileLimits === undefined ? [] : ['--file-limits', JSON.stringify(fileLimits)]),
    ...exceptions.flatMap(({ rule, paths }) =>
      paths.flatMap((glob) => ['--exception', `${rule}${EXCEPTION_SEPARATOR}${glob}`]),
    ),
    ...(kotlin.formatter === undefined ? [] : ['--kotlin-formatter', kotlin.formatter]),
    ...(kotlin.detektConfig === undefined ? [] : ['--kotlin-detekt-config', kotlin.detektConfig]),
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

function fileLimitThresholds(thresholds) {
  const limits = FILE_LIMIT_THRESHOLDS.filter((key) => thresholds[key] !== undefined);
  return limits.length === 0
    ? undefined
    : Object.fromEntries(limits.map((key) => [key, thresholds[key]]));
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
