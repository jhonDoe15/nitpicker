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

const INVENTORY_TOOL = 'java';
const FILE_LIMIT_THRESHOLDS = ['fileLines', 'testFileLines', 'lineLength', 'folderFiles'];
const TYPESCRIPT_ONLY_KEYS = ['layout', 'exceptions', 'react', 'tools'];
const JAVA_EXCEPTION_RULES = SHARED_EXCEPTION_RULES.filter(
  (rule) => !JAVA_NATIVE_RULES.includes(rule),
);

export function validateJavaConfig(config) {
  const unsupported = TYPESCRIPT_ONLY_KEYS.filter(
    (key) =>
      config[key] !== undefined &&
      !(key === 'exceptions' && liftsOnlyRules(config[key], JAVA_EXCEPTION_RULES)),
  );
  if (unsupported.length > 0) {
    throw configError(
      `"${unsupported[0]}" is not supported with "preset": "java": it describes the TypeScript source layout and ESLint rules, which the Java preset does not have. Not supported with java: ${TYPESCRIPT_ONLY_KEYS.join(', ')}, except exceptions for ${JAVA_EXCEPTION_RULES.join(', ')}. Shared by both presets: thresholds, exclude, legacyInventory`,
    );
  }
  if (config.thresholds?.lineLength !== undefined) {
    throw configError(
      '"thresholds.lineLength" is not supported with "preset": "java": Checkstyle checks Java line length; set it in config/checkstyle/checkstyle.xml',
    );
  }
}

export function configureJavaAnalyzer(
  analyzer,
  { thresholds = {}, exclude = [], legacyInventory, exceptions = [] },
) {
  const fileLimits = javaFileLimits(thresholds, exceptions);
  if (
    thresholds.crapLimit === undefined &&
    exclude.length === 0 &&
    legacyInventory === undefined &&
    fileLimits === undefined
  ) {
    return analyzer;
  }
  const adapterArguments = [
    ...(thresholds.crapLimit === undefined ? [] : ['--crap-limit', String(thresholds.crapLimit)]),
    ...exclude.flatMap((glob) => ['--exclude', glob]),
    ...(fileLimits === undefined ? [] : ['--file-limits', JSON.stringify(fileLimits)]),
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

function javaFileLimits(thresholds, exceptions) {
  const limits = Object.fromEntries(
    FILE_LIMIT_THRESHOLDS.filter((key) => thresholds[key] !== undefined).map((key) => [
      key,
      thresholds[key],
    ]),
  );
  const lifted = exceptions.filter(({ rule }) => SHARED_EXCEPTION_RULES.includes(rule));
  return Object.keys(limits).length === 0 && lifted.length === 0
    ? undefined
    : { thresholds: limits, exceptions: lifted };
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
    legacyInventory,
    policyRoot,
    baselineRoot,
    snapshot = 'head',
    inventoryTool = INVENTORY_TOOL,
  } = {},
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
    ...evaluateBaselineExpansions(baseInventory.sites, headInventory.sites, inventoryTool),
  ];
}
