import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { parseRunnerArguments } from '../../../core/tooling/runner-arguments.mjs';
import { withLegacyInventory } from '../../../shared/legacy-inventory.mjs';
import { configError, TYPESCRIPT_ONLY_KEYS } from '../../../shared/config.mjs';
import {
  BUILD_DECLARED_TOOLS,
  GRADLE_PRESETS,
  JAVA_TOOLS,
  PROJECT_TOOL_CONFIGS,
  precedenceToolNames,
} from './gradle-presets.mjs';
import {
  isJavaFindingRule,
  validateJavaFindingRule,
} from './exception-rules/java-finding-rules.mjs';
import { KOTLIN_FORMATTERS } from './kotlin/kotlin-options.mjs';
import { JAVA_LINE_LENGTH, JAVA_SIZE_RULES } from '../../../shared/project-rules/size-rules.mjs';
import { SHARED_EXCEPTION_RULES } from '../../../shared/policy.mjs';
import { sharedRouteRule } from '../../../shared/exceptions/routes.mjs';
import { INLINE_SUPPRESSION_RULE } from './suppressions/java-suppressions.mjs';
import { canonicalRule } from '../../../shared/exceptions/rule-names.mjs';
import { declaredToolDigest } from './tool-config/declared/declared-choices.mjs';

const FILE_LIMIT_THRESHOLDS = [
  'fileLines',
  'testFileLines',
  'lineLength',
  'folderFiles',
  'folderDepth',
  'classMethods',
  'classFields',
  'inheritanceDepth',
];
const TEST_TIME_THRESHOLDS = ['unitTestSeconds', 'integrationTestSeconds'];
const NATIVE_LINE_LENGTH = {
  java: `Java line length follows the formatter (google-java-format wraps at ${String(JAVA_LINE_LENGTH)}, palantir-java-format at 120); with the "conventions" key "java.formatter" set to "none", "java.lineLength" (any number of columns) sets it, as does max on LineLength in config/checkstyle/checkstyle.xml once "tools": { "checkstyle": { "precedence": ["project"] } } opts in, and an exception for "line-length-limit" lifts the rule for some paths`,
  kotlin: `the "conventions" key "kotlin.lineLength" (any number of columns) sets it for ktlint, ktfmt and detekt when a formatter runs; otherwise set style>MaxLineLength in config/detekt/detekt.yml and opt in with "tools": { "detekt": { "precedence": ["project"] } }; the Java files follow "java.lineLength" (${String(JAVA_LINE_LENGTH)} by default, or max on LineLength in config/checkstyle/checkstyle.xml once "tools": { "checkstyle": { "precedence": ["project"] } } opts in), and an exception for "line-length-limit" lifts that for some paths`,
};
const JAVA_EXCEPTION_RULES = [...SHARED_EXCEPTION_RULES, ...JAVA_SIZE_RULES];

const MOVES_OPTION = '--baseline-moves-file';

export function parseJavaRunnerArguments(argumentList) {
  const at = argumentList.indexOf(MOVES_OPTION);
  const movesFile = at === -1 ? undefined : argumentList[at + 1];
  if (
    at !== -1 &&
    !(movesFile !== undefined && existsSync(movesFile) && statSync(movesFile).isFile())
  ) {
    throw new Error(`${MOVES_OPTION} must be a file`);
  }
  const parsed = parseRunnerArguments(at === -1 ? argumentList : argumentList.toSpliced(at, 2), {
    runner: 'java-runner.mjs',
    choices: { '--preset': GRADLE_PRESETS, '--kotlin-formatter': KOTLIN_FORMATTERS },
    precedenceTools: precedenceToolNames(),
  });
  return movesFile === undefined
    ? parsed
    : { ...parsed, policy: { ...parsed.policy, baselineMovesFile: movesFile } };
}

function movesArguments(analyzer, { baselineMovesFile }) {
  return baselineMovesFile === undefined || !GRADLE_PRESETS.includes(analyzer.name)
    ? []
    : [MOVES_OPTION, baselineMovesFile];
}

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
      validateJavaExceptionRule(entry, `exceptions[${String(index)}].rule`);
    }
  }
  if (config.thresholds?.lineLength !== undefined) {
    throw configError(
      `"thresholds.lineLength" is not supported with "preset": "${config.preset}": ${NATIVE_LINE_LENGTH[config.preset]}`,
    );
  }
}

function validateJavaExceptionRule(entry, label) {
  const rule = entry?.rule;
  if (
    typeof rule !== 'string' ||
    rule === '' ||
    JAVA_EXCEPTION_RULES.includes(canonicalRule(rule))
  ) {
    return;
  }
  if (!isJavaFindingRule(rule)) {
    throw configError(
      `"${label}" must name a finding as it is printed, "<tool>/<rule>" (for example "pmd/SpringConstructorInjection"), or one of ${JAVA_EXCEPTION_RULES.join(', ')}. Tools: ${JAVA_TOOLS.join(', ')}`,
    );
  }
  validateJavaFindingRule(entry, label);
}

function runnerArguments({
  thresholds = {},
  exclude = [],
  exceptions = [],
  kotlin = {},
  duplicates = {},
  tools = {},
  testConsole = {},
}) {
  const fileLimits = chosenThresholds(thresholds, FILE_LIMIT_THRESHOLDS);
  const testSeconds = chosenThresholds(thresholds, TEST_TIME_THRESHOLDS);
  return [
    ...(thresholds.crapLimit === undefined ? [] : ['--crap-limit', String(thresholds.crapLimit)]),
    ...exclude.flatMap((glob) => ['--exclude', glob]),
    ...(fileLimits === undefined ? [] : ['--file-limits', JSON.stringify(fileLimits)]),
    ...(testSeconds === undefined ? [] : ['--test-seconds', JSON.stringify(testSeconds)]),
    ...(testConsole.allow === undefined
      ? []
      : ['--test-console-allow', JSON.stringify(testConsole.allow)]),
    ...exceptions.flatMap((exception) => ['--exception', exceptionArgument(exception)]),
    ...(kotlin.formatter === undefined ? [] : ['--kotlin-formatter', kotlin.formatter]),
    ...(kotlin.detektConfig === undefined ? [] : ['--kotlin-detekt-config', kotlin.detektConfig]),
    ...(duplicates.skippedFolders === undefined
      ? []
      : ['--duplicate-skipped-folders', JSON.stringify(duplicates.skippedFolders)]),
    ...precedenceToolNames()
      .filter((tool) => tools[tool] !== undefined)
      .flatMap((tool) => [`--${tool}-precedence`, tools[tool].precedence.join(',')]),
  ];
}

export function configureJavaAnalyzer(analyzer, options) {
  const { legacyInventory, tools = {}, styleFiles } = options;
  const adapterArguments = runnerArguments(options);
  if (adapterArguments.length === 0 && legacyInventory === undefined) {
    return analyzer;
  }
  const configurationHash = hashWithArguments(analyzer.configurationHash, adapterArguments);
  const projectConfigDirectories = [...PROJECT_TOOL_CONFIGS]
    .filter(([tool]) => tools[tool]?.precedence.includes('project'))
    .map(([, file]) => path.dirname(file));
  const declared = declaredPrecedence(tools);
  const configured = {
    ...analyzer,
    configurationHash,
    ...(projectConfigDirectories.length === 0 && styleFiles === undefined && declared === undefined
      ? {}
      : {
          resolveConfigurationHash: (policyRoot) =>
            hashWithProjectConfigs(configurationHash, policyRoot, {
              directories: projectConfigDirectories,
              files: styleFiles?.(policyRoot) ?? [],
              declared:
                declared === undefined ? undefined : declaredToolDigest(declared, policyRoot),
            }),
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
          ...movesArguments(analyzer, context),
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

function declaredPrecedence(tools) {
  const listed = BUILD_DECLARED_TOOLS.filter((tool) => tools[tool]?.precedence.includes('project'));
  return listed.length === 0
    ? undefined
    : Object.fromEntries(listed.map((tool) => [tool, tools[tool].precedence]));
}

function hashWithProjectConfigs(configurationHash, policyRoot, { directories, files, declared }) {
  const hash = createHash('sha256').update(configurationHash);
  if (declared !== undefined) {
    hash.update(`declared\0${declared}\0`);
  }
  const named = [
    ...directories.flatMap((directory) => filesUnder(policyRoot, directory)),
    ...files.map((file) => path.relative(policyRoot, file)),
  ];
  for (const file of named) {
    const absolute = path.resolve(policyRoot, file);
    if (existsSync(absolute)) {
      const content = readFileSync(absolute);
      hash.update(`${file}\0${String(content.length)}\0`).update(content);
    }
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

export function javaRouteRule(finding) {
  return LINT_TOOLS.includes(finding.tool) && finding.rule !== INLINE_SUPPRESSION_RULE
    ? `${finding.tool}/${finding.rule}`
    : sharedRouteRule(finding);
}
