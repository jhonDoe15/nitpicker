import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
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
} from './exception-rules/java-finding-rules.mts';
import { JAVA_BUILD_TOOLS } from '../builds/java-build.mjs';
import { KOTLIN_FORMATTERS } from './kotlin/kotlin-options.mts';
import { JAVA_LINE_LENGTH, JAVA_SIZE_RULES } from '../../../shared/project-rules/size-rules.mjs';
import { SHARED_EXCEPTION_RULES } from '../../../shared/policy.mjs';
import { INLINE_SUPPRESSION_RULE } from './suppressions/java-suppressions.mjs';
import {
  canonical,
  FILE_LIMIT_THRESHOLDS,
  TEST_TIME_THRESHOLDS,
  parseArguments,
  routeRuleOf,
  toolDigest,
  withInventory,
  type ConfigureOptions,
  type InvocationContext,
  type JavaAnalyzer,
  type JavaConfig,
  type ParsedArguments,
  type RunnerConfig,
  type ToolSettings,
} from './typed/java-policy-types.mts';
import { fieldOf, listOf, textOf } from '../../../shared/values/readers.mts';
import type { JavaFinding } from './typed/java-values.mts';

export const NATIVE_LINE_LENGTH: Readonly<Record<string, string>> = {
  java: `Java line length follows the formatter (google-java-format wraps at ${String(JAVA_LINE_LENGTH)}, palantir-java-format and Spring Java Format at 120); with the "conventions" key "java.formatter" set to "none", "java.lineLength" (any number of columns) sets it, as does max on LineLength in config/checkstyle/checkstyle.xml once "tools": { "checkstyle": { "precedence": ["project"] } } opts in, and an exception for "line-length-limit" lifts the rule for some paths`,
  kotlin: `the "conventions" key "kotlin.lineLength" (any number of columns) sets it for ktlint, ktfmt and detekt when a formatter runs; otherwise set style>MaxLineLength in config/detekt/detekt.yml and opt in with "tools": { "detekt": { "precedence": ["project"] } }; the Java files follow "java.lineLength" (${String(JAVA_LINE_LENGTH)} by default, or max on LineLength in config/checkstyle/checkstyle.xml once "tools": { "checkstyle": { "precedence": ["project"] } } opts in), and an exception for "line-length-limit" lifts that for some paths`,
};
export const JAVA_EXCEPTION_RULES = [...SHARED_EXCEPTION_RULES, ...JAVA_SIZE_RULES];

const MOVES_OPTION = '--baseline-moves-file';

export function parseJavaRunnerArguments(argumentList: readonly string[]): ParsedArguments {
  const at = argumentList.indexOf(MOVES_OPTION);
  const movesFile = at === -1 ? undefined : argumentList[at + 1];
  if (
    at !== -1 &&
    !(movesFile !== undefined && existsSync(movesFile) && statSync(movesFile).isFile())
  ) {
    throw new Error(`${MOVES_OPTION} must be a file`);
  }
  const parsed = parseArguments(at === -1 ? argumentList : argumentList.toSpliced(at, 2), {
    runner: 'java-runner.mjs',
    choices: {
      '--preset': GRADLE_PRESETS,
      '--kotlin-formatter': KOTLIN_FORMATTERS,
      '--build-tool': JAVA_BUILD_TOOLS,
    },
    precedenceTools: precedenceToolNames(),
  });
  return movesFile === undefined
    ? parsed
    : { ...parsed, policy: { ...parsed.policy, baselineMovesFile: movesFile } };
}

function movesArguments(
  analyzer: JavaAnalyzer,
  { baselineMovesFile }: InvocationContext,
): string[] {
  return baselineMovesFile === undefined || !GRADLE_PRESETS.includes(analyzer.name)
    ? []
    : [MOVES_OPTION, baselineMovesFile];
}

export function validateJavaConfig(config: JavaConfig): void {
  const typescriptOnly = TYPESCRIPT_ONLY_KEYS.filter(
    (key) => !['exceptions', 'tools'].includes(key),
  );
  const unsupported = typescriptOnly.filter((key) => config[key] !== undefined);
  if (unsupported.length > 0) {
    const preset = textOf(config.preset);
    throw configError(
      `"${textOf(unsupported[0])}" is not supported with "preset": "${preset}": it describes the TypeScript source layout and React rules, which the ${preset} preset does not have. Not supported with ${preset}: ${typescriptOnly.join(', ')}. Shared by all presets: thresholds, exclude, legacyInventory`,
    );
  }
  if (config.preset === 'java' && Array.isArray(config.exceptions)) {
    for (const [index, entry] of listOf(config.exceptions).entries()) {
      validateJavaExceptionRule(entry, `exceptions[${String(index)}].rule`);
    }
  }
  if (config.thresholds?.['lineLength'] !== undefined) {
    throw configError(
      `"thresholds.lineLength" is not supported with "preset": "${textOf(config.preset)}": ${textOf(NATIVE_LINE_LENGTH[textOf(config.preset)])}`,
    );
  }
}

function validateJavaExceptionRule(entry: unknown, label: string): void {
  const rule = fieldOf(entry, 'rule');
  if (typeof rule !== 'string' || rule === '' || JAVA_EXCEPTION_RULES.includes(canonical(rule))) {
    return;
  }
  if (!isJavaFindingRule(rule)) {
    throw configError(
      `"${label}" must name a finding as it is printed, "<tool>/<rule>" (for example "pmd/SpringConstructorInjection"), or one of ${JAVA_EXCEPTION_RULES.join(', ')}. Tools: ${JAVA_TOOLS.join(', ')}`,
    );
  }
  validateJavaFindingRule({ rule, paths: fieldOf(entry, 'paths') }, label);
}

function runnerArguments({
  thresholds = {},
  exclude = [],
  exceptions = [],
  kotlin = {},
  java = { analyzeGeneratedSources: false },
  mutationOff = false,
  duplicates = {},
  tools = {},
  testConsole = {},
}: RunnerConfig): string[] {
  const fileLimits = chosenThresholds(thresholds, FILE_LIMIT_THRESHOLDS);
  const testSeconds = chosenThresholds(thresholds, TEST_TIME_THRESHOLDS);
  return [
    ...(thresholds['crapLimit'] === undefined
      ? []
      : ['--crap-limit', textOf(thresholds['crapLimit'])]),
    ...exclude.flatMap((glob) => ['--exclude', glob]),
    ...(fileLimits === undefined ? [] : ['--file-limits', JSON.stringify(fileLimits)]),
    ...(testSeconds === undefined ? [] : ['--test-seconds', JSON.stringify(testSeconds)]),
    ...(testConsole.allow === undefined
      ? []
      : ['--test-console-allow', JSON.stringify(testConsole.allow)]),
    ...exceptions.flatMap((exception) => ['--exception', exceptionArgument(exception)]),
    ...(kotlin.formatter === undefined ? [] : ['--kotlin-formatter', kotlin.formatter]),
    ...(mutationOff ? ['--mutation', 'off'] : []),
    ...(java.buildTool === undefined ? [] : ['--build-tool', java.buildTool]),
    ...(java.analyzeGeneratedSources ? ['--analyze-generated-sources', 'true'] : []),
    ...(kotlin.detektConfig === undefined ? [] : ['--kotlin-detekt-config', kotlin.detektConfig]),
    ...(duplicates.skippedFolders === undefined
      ? []
      : ['--duplicate-skipped-folders', JSON.stringify(duplicates.skippedFolders)]),
    ...precedenceToolNames().flatMap((tool) => {
      const setting = tools[tool];
      return setting === undefined ? [] : [`--${tool}-precedence`, setting.precedence.join(',')];
    }),
  ];
}

export function configureJavaAnalyzer(
  analyzer: JavaAnalyzer,
  options: ConfigureOptions,
): JavaAnalyzer {
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
          resolveConfigurationHash: (policyRoot: string) =>
            hashWithProjectConfigs(configurationHash, policyRoot, {
              directories: projectConfigDirectories,
              files: styleFiles?.(policyRoot) ?? [],
              declared: declared === undefined ? undefined : toolDigest(declared, policyRoot),
            }),
        }),
    createInvocation: (context: InvocationContext) => {
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
          ...(context.logRoot === undefined
            ? []
            : ['--log-root', context.logRoot, '--log-label', textOf(context.logLabel)]),
          ...movesArguments(analyzer, context),
        ],
      };
    },
  };
  return legacyInventory === undefined ? configured : withInventory(configured, legacyInventory);
}

function exceptionArgument({
  rule,
  paths,
  function: functionName,
}: NonNullable<RunnerConfig['exceptions']>[number]): string {
  return JSON.stringify({
    rule,
    paths,
    ...(functionName === undefined ? {} : { function: functionName }),
  });
}

function declaredPrecedence(
  tools: ToolSettings,
): Record<string, readonly string[] | undefined> | undefined {
  const listed = BUILD_DECLARED_TOOLS.filter((tool) => tools[tool]?.precedence.includes('project'));
  return listed.length === 0
    ? undefined
    : Object.fromEntries(listed.map((tool) => [tool, tools[tool]?.precedence]));
}

function hashWithProjectConfigs(
  configurationHash: string,
  policyRoot: string,
  {
    directories,
    files,
    declared,
  }: { directories: string[]; files: string[]; declared: string | undefined },
): string {
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

function filesUnder(root: string, directory: string): string[] {
  const base = path.resolve(root);
  const absolute = path.resolve(base, directory);
  if (!absolute.startsWith(base + path.sep)) {
    return [];
  }
  if (!existsSync(absolute)) {
    return [];
  }
  return readdirSync(absolute, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(root, path.join(entry.parentPath, entry.name)))
    .sort();
}

function chosenThresholds(
  thresholds: Readonly<Record<string, unknown>>,
  keys: readonly string[],
): Record<string, unknown> | undefined {
  const limits = keys.filter((key) => thresholds[key] !== undefined);
  return limits.length === 0
    ? undefined
    : Object.fromEntries(limits.map((key) => [key, thresholds[key]]));
}

function hashWithArguments(configurationHash: string, adapterArguments: string[]): string {
  return adapterArguments.length === 0
    ? configurationHash
    : createHash('sha256')
        .update(configurationHash)
        .update(JSON.stringify(adapterArguments))
        .digest('hex');
}

const LINT_TOOLS: readonly string[] = ['archunit'];

export function javaRouteRule(finding: JavaFinding): string {
  return LINT_TOOLS.includes(finding.tool) && finding.rule !== INLINE_SUPPRESSION_RULE
    ? `${finding.tool}/${finding.rule}`
    : routeRuleOf(finding);
}
