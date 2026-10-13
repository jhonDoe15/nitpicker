import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { globToRegExp } from '../../../shared/glob.mjs';
import {
  applyInventoryToFindings,
  readOptionalInventory,
  withLegacyInventory,
} from '../../../shared/legacy-inventory.mjs';
import { configError } from '../../../shared/config.mjs';
import { JAVA_TOOLS } from './gradle-presets.mjs';
import { JAVA_NATIVE_RULES, SHARED_EXCEPTION_RULES } from '../../../shared/policy.mjs';
import { evaluateBaselineExpansions } from '../../../shared/rules/baseline-expansion.mjs';

export const EXCEPTION_SEPARATOR = ':';
export const PROJECT_TOOL_CONFIGS = new Map([
  ['pmd', 'config/pmd/ruleset.xml'],
  ['checkstyle', 'config/checkstyle/checkstyle.xml'],
]);
const FILE_LIMIT_THRESHOLDS = ['fileLines', 'testFileLines', 'lineLength', 'folderFiles'];
const TYPESCRIPT_ONLY_KEYS = ['layout', 'exceptions', 'react', 'tools'];
const NATIVE_LINE_LENGTH = {
  java: 'Checkstyle checks Java line length; set it in config/checkstyle/checkstyle.xml',
  kotlin: 'detekt checks Kotlin line length; set style>MaxLineLength in config/detekt/detekt.yml',
};
const JAVA_EXCEPTION_RULES = SHARED_EXCEPTION_RULES.filter(
  (rule) => !JAVA_NATIVE_RULES.includes(rule),
);

export function validateJavaConfig(config) {
  const typescriptOnly = TYPESCRIPT_ONLY_KEYS.filter(
    (key) => !['exceptions', 'tools'].includes(key),
  );
  const unsupported = typescriptOnly.filter((key) => config[key] !== undefined);
  if (unsupported.length > 0) {
    const preset = config.preset;
    throw configError(
      `"${unsupported[0]}" is not supported with "preset": "${preset}": it describes the TypeScript source layout and React rules, which the ${preset} preset does not have. Not supported with ${preset}: ${typescriptOnly.join(', ')}. Shared by all presets: thresholds, exclude, legacyInventory`,
    );
  }
  if (config.preset === 'java' && Array.isArray(config.exceptions)) {
    for (const [index, entry] of config.exceptions.entries()) {
      validateJavaExceptionRule(entry?.rule, `exceptions[${String(index)}].rule`);
    }
  }
  if (config.thresholds?.lineLength !== undefined) {
    throw configError(
      `"thresholds.lineLength" is not supported with "preset": "${config.preset}": ${NATIVE_LINE_LENGTH[config.preset]}`,
    );
  }
}

function validateJavaExceptionRule(rule, label) {
  if (typeof rule !== 'string' || rule === '' || JAVA_EXCEPTION_RULES.includes(rule)) {
    return;
  }
  const [tool] = rule.split('/');
  if (!JAVA_TOOLS.includes(tool) || rule.length <= tool.length + 1) {
    throw configError(
      `"${label}" must name a finding as it is printed, "<tool>/<rule>" (for example "pmd/SpringConstructorInjection"), or one of ${JAVA_EXCEPTION_RULES.join(', ')}. Tools: ${JAVA_TOOLS.join(', ')}`,
    );
  }
}

export function configureJavaAnalyzer(
  analyzer,
  { thresholds = {}, exclude = [], exceptions = [], legacyInventory, kotlin = {}, tools = {} },
) {
  const toolArguments = [...PROJECT_TOOL_CONFIGS.keys()]
    .filter((tool) => tools[tool] !== undefined)
    .flatMap((tool) => [`--${tool}-precedence`, tools[tool].precedence.join(',')]);
  const fileLimits = fileLimitThresholds(thresholds);
  if (
    fileLimits === undefined &&
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
    ...(fileLimits === undefined ? [] : ['--file-limits', JSON.stringify(fileLimits)]),
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
