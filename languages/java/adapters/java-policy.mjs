import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { globToRegExp } from '../../../shared/glob.mjs';
import {
  applyInventoryToFindings,
  readOptionalInventory,
  withLegacyInventory,
} from '../../../shared/legacy-inventory.mjs';
import { configError, TYPESCRIPT_ONLY_KEYS } from '../../../shared/config.mjs';
import { JAVA_TOOLS, PROJECT_TOOL_CONFIGS } from './gradle-presets.mjs';
import { JAVA_NATIVE_RULES, SHARED_EXCEPTION_RULES } from '../../../shared/policy.mjs';
import { applyFindingExceptions } from '../../../shared/exceptions/finding-exceptions.mjs';
import { sharedRouteRule, withExceptionRoutes } from '../../../shared/exceptions/routes.mjs';
import { evaluateBaselineExpansions } from '../../../shared/rules/baseline-expansion.mjs';
import { INLINE_SUPPRESSION_RULE } from './suppressions/java-suppressions.mjs';
import { canonicalRule } from '../../../shared/exceptions/rule-names.mjs';
import { checkstyleRuleName } from '../messages/rule-messages.mjs';

const FILE_LIMIT_THRESHOLDS = ['fileLines', 'testFileLines', 'lineLength', 'folderFiles'];
const TEST_TIME_THRESHOLDS = ['unitTestSeconds', 'integrationTestSeconds'];
const NATIVE_LINE_LENGTH = {
  java: 'Checkstyle checks Java line length; set it in config/checkstyle/checkstyle.xml and opt in with "tools": { "checkstyle": { "precedence": ["project"] } }',
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
  if (
    typeof rule !== 'string' ||
    rule === '' ||
    JAVA_EXCEPTION_RULES.includes(canonicalRule(rule))
  ) {
    return;
  }
  const [tool] = rule.split('/');
  const checkstyleRule = rule.slice('checkstyle/'.length);
  if (tool === 'checkstyle' && checkstyleRuleName(checkstyleRule) !== checkstyleRule) {
    throw configError(
      `"${label}" names a Checkstyle check by class; findings print the check's name, so write "checkstyle/${checkstyleRuleName(checkstyleRule)}"`,
    );
  }
  if (!JAVA_TOOLS.includes(tool) || rule.length <= tool.length + 1) {
    throw configError(
      `"${label}" must name a finding as it is printed, "<tool>/<rule>" (for example "pmd/SpringConstructorInjection"), or one of ${JAVA_EXCEPTION_RULES.join(', ')}. Tools: ${JAVA_TOOLS.join(', ')}`,
    );
  }
}

function javaAdapterArguments({
  thresholds = {},
  exclude = [],
  exceptions = [],
  kotlin = {},
  tools = {},
}) {
  const fileLimits = chosenThresholds(thresholds, FILE_LIMIT_THRESHOLDS);
  const testSeconds = chosenThresholds(thresholds, TEST_TIME_THRESHOLDS);
  return [
    ...(thresholds.crapLimit === undefined ? [] : ['--crap-limit', String(thresholds.crapLimit)]),
    ...exclude.flatMap((glob) => ['--exclude', glob]),
    ...(fileLimits === undefined ? [] : ['--file-limits', JSON.stringify(fileLimits)]),
    ...(testSeconds === undefined ? [] : ['--test-seconds', JSON.stringify(testSeconds)]),
    ...exceptions.flatMap((exception) => ['--exception', exceptionArgument(exception)]),
    ...(kotlin.formatter === undefined ? [] : ['--kotlin-formatter', kotlin.formatter]),
    ...(kotlin.detektConfig === undefined ? [] : ['--kotlin-detekt-config', kotlin.detektConfig]),
    ...[...PROJECT_TOOL_CONFIGS.keys()]
      .filter((tool) => tools[tool] !== undefined)
      .flatMap((tool) => [`--${tool}-precedence`, tools[tool].precedence.join(',')]),
  ];
}

export function configureJavaAnalyzer(analyzer, options) {
  const { exceptions = [], legacyInventory, tools = {} } = options;
  const adapterArguments = javaAdapterArguments(options);
  if (adapterArguments.length === 0 && exceptions.length === 0 && legacyInventory === undefined) {
    return analyzer;
  }
  const configurationHash = hashWithArguments(analyzer.configurationHash, adapterArguments);
  const projectConfigDirectories = [...PROJECT_TOOL_CONFIGS]
    .filter(([tool]) => tools[tool]?.precedence.includes('project'))
    .map(([, file]) => path.dirname(file));
  const configured = {
    ...analyzer,
    configurationHash,
    ...(projectConfigDirectories.length === 0
      ? {}
      : {
          resolveConfigurationHash: (policyRoot) =>
            hashWithProjectConfigDirectories(
              configurationHash,
              policyRoot,
              projectConfigDirectories,
            ),
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

function exceptionArgument({ rule, paths, function: functionName }) {
  return JSON.stringify({
    rule,
    paths,
    ...(functionName === undefined ? {} : { function: functionName }),
  });
}

function hashWithProjectConfigDirectories(configurationHash, policyRoot, directories) {
  const hash = createHash('sha256').update(configurationHash);
  for (const file of directories.flatMap((directory) => filesUnder(policyRoot, directory))) {
    const content = readFileSync(path.join(policyRoot, file));
    hash.update(`${file}\0${String(content.length)}\0`).update(content);
  }
  return hash.digest('hex');
}

function filesUnder(root, directory) {
  const absolute = path.join(root, directory);
  if (!existsSync(absolute)) {
    return [];
  }
  return readdirSync(absolute, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(root, path.join(entry.parentPath, entry.name)))
    .sort();
}

function chosenThresholds(thresholds, keys) {
  const limits = keys.filter((key) => thresholds[key] !== undefined);
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

const LINT_TOOLS = ['archunit'];

function javaRouteRule(finding) {
  return LINT_TOOLS.includes(finding.tool) && finding.rule !== INLINE_SUPPRESSION_RULE
    ? `${finding.tool}/${finding.rule}`
    : sharedRouteRule(finding);
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
  resolveOverlaps = (reported) => reported,
) {
  const excluders = exclude.map((glob) => globToRegExp(glob));
  const kept = resolveOverlaps(
    applyFindingExceptions(
      withExceptionRoutes(
        findings.filter((finding) => !excluders.some((matcher) => matcher.test(finding.path))),
        javaRouteRule,
      ),
      exceptions,
    ),
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
