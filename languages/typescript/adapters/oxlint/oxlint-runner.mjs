import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import {
  directiveComments,
  inlineConfigMessages,
  materializedDirectory,
  overlayFile,
  withoutDirectives,
  withRenamedRules,
} from './oxlint-inline-config.mjs';
import {
  trackTemporaryPath,
  untrackTemporaryPath,
} from '../../../../core/tooling/temporary-files.mjs';
import { resolveTool } from '../../../../core/tooling/tool-resolution.mjs';
import {
  messageIdResolver,
  nativeRuleIndex,
  PARITY_BRIDGED_RULES,
  rejectedRuleIds,
  reportedRuleKey,
  translatePlan,
} from './oxlint-translation.mjs';

const MAX_OUTPUT_BYTES = 200 * 1024 * 1024;
const MAX_ARGUMENT_BYTES = 1024 * 1024;
const MAX_CONFIGURATION_ATTEMPTS = 20;
const SENTINEL_HINT = / Unused [a-z ]+ should match \/\[\^\\s\\S\]\/\./gu;
const STAGE_DIRECTORY = '.nitpicker-oxlint';
const IRREGULAR_WHITESPACE_RULE = 'no-irregular-whitespace';
const TSCONFIG_ERROR_CODE = 'typescript(tsconfig-error)';
const TOLERATED_TSCONFIG_ERRORS = [
  /Cannot find type definition file/u,
  /Option '[^']+' (?:has been removed|is deprecated)/u,
];
const ENGINE_HINT =
  'Set "tools": { "eslint": { "engine": "eslint" } } in nitpicker.config.json to lint with ESLint instead.';

export function lintWithOxlint({ options, environment, projectConfigPath, runEslintCli }) {
  const plan = spawnJson(
    [path.join(import.meta.dirname, 'oxlint-plan.mjs'), options.projectRoot, ...options.patterns],
    {
      cwd: options.projectRoot,
      env: environment,
      context: 'oxlint planning',
      timeoutMs: options.timeoutMs,
    },
  );
  const files = plan.groups.flatMap((group) => group.files);
  const stage = trackTemporaryPath(createStage(options.projectRoot, projectConfigPath));
  try {
    if (projectConfigPath !== undefined) {
      hideNestedTypeScriptConfigs(stage, options.projectRoot, files);
    }
    const inlineConfig = neutralizeInlineConfig(stage, options.projectRoot, plan.noInlineConfig);
    const directiveFiles = directiveFilesOf(options.projectRoot, files, plan.noInlineConfig);
    const { translation, results } = lintUntilAccepted({
      plan,
      stage,
      projectRoot: options.projectRoot,
      environment,
      timeoutMs: options.timeoutMs,
      neutralized: new Map([
        ...inlineConfig.neutralized,
        ...oxlintDirectiveLocations(directiveFiles),
      ]),
      directiveFiles,
    });
    return mergeResults([
      ...results,
      ...inlineConfig.results,
      ...residualResults(options.projectRoot, translation.residual, runEslintCli),
    ]).map((result) => ({ ...result, filePath: path.join(options.projectRoot, result.filePath) }));
  } finally {
    rmSync(stage, { recursive: true, force: true });
    untrackTemporaryPath(stage);
  }
}

function oxlintBinary() {
  return resolveTool('oxlint', { bin: 'bin/oxlint' }).binPath;
}

function tsgolintBinary() {
  const packageRoot = path.dirname(resolveTool('oxlint-tsgolint', { bin: 'package.json' }).binPath);
  const executable = process.platform === 'win32' ? 'tsgolint.exe' : 'tsgolint';
  const platformPackage = `@oxlint-tsgolint/${process.platform}-${process.arch}`;
  try {
    return createRequire(path.join(packageRoot, 'package.json')).resolve(
      `${platformPackage}/${executable}`,
    );
  } catch (error) {
    throw new Error(
      `The type-aware lint rules need ${platformPackage}, which is not installed. ${ENGINE_HINT}`,
      { cause: error },
    );
  }
}

function nativeRules(environment) {
  const listed = spawnJson([oxlintBinary(), '--rules', '--format', 'json'], {
    cwd: tmpdir(),
    env: environment,
    context: 'oxlint rule listing',
  });
  return { nativeRules: nativeRuleIndex(listed) };
}

function hideNestedTypeScriptConfigs(stage, projectRoot, files) {
  for (const directory of nestedConfigDirectories(projectRoot, files)) {
    const stageDirectory = materializedDirectory({
      stage,
      projectRoot,
      relativeDirectory: directory,
    });
    unlinkSync(path.join(stageDirectory, 'tsconfig.json'));
  }
}

function nestedConfigDirectories(projectRoot, files) {
  const directories = new Set(
    files.flatMap((file) => ancestorDirectories(path.posix.dirname(file))),
  );
  return [...directories]
    .sort()
    .filter((directory) => existsSync(path.join(projectRoot, directory, 'tsconfig.json')));
}

function ancestorDirectories(directory) {
  const segments = directory === '.' ? [] : directory.split('/');
  return segments.map((_segment, index) => segments.slice(0, index + 1).join('/'));
}

function createStage(projectRoot, projectConfigPath) {
  const stage = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-oxlint-')));
  for (const entry of readdirSync(projectRoot)) {
    if (projectConfigPath !== undefined && entry === 'tsconfig.json') continue;
    symlinkSync(path.join(projectRoot, entry), path.join(stage, entry));
  }
  if (projectConfigPath !== undefined) {
    writeFileSync(path.join(stage, 'tsconfig.json'), lintTypeScriptConfig(projectConfigPath));
  }
  mkdirSync(path.join(stage, STAGE_DIRECTORY));
  return stage;
}

function lintTypeScriptConfig(projectConfigPath) {
  const { config, error } = ts.parseConfigFileTextToJson(
    projectConfigPath,
    readFileSync(projectConfigPath, 'utf8'),
  );
  if (error !== undefined) {
    throw new Error(`Lint TypeScript config ${projectConfigPath} is not valid JSON`);
  }
  return JSON.stringify({
    ...config,
    ...(config.extends === undefined
      ? {}
      : { extends: rebasedExtends(config.extends, path.dirname(projectConfigPath)) }),
    compilerOptions: { ...config.compilerOptions, noEmit: true },
  });
}

function rebasedExtends(value, directory) {
  return Array.isArray(value)
    ? value.map((entry) => rebasedExtend(entry, directory))
    : rebasedExtend(value, directory);
}

function rebasedExtend(value, directory) {
  return value.startsWith('./') || value.startsWith('../') ? path.resolve(directory, value) : value;
}

function writeStageConfig({ stage, projectRoot, sampleFile, translation }) {
  const bridge = pathToFileURL(path.join(import.meta.dirname, 'oxlint-bridge.mjs')).href;
  const jsPlugins = translation.plugins.map((plugin) => {
    const request = { ...plugin, projectRoot, sampleFile };
    writeFileSync(
      path.join(stage, STAGE_DIRECTORY, `${plugin.alias}.mjs`),
      `import { bridgedPlugin } from ${JSON.stringify(bridge)};\nexport default await bridgedPlugin(${JSON.stringify(request)});\n`,
    );
    return `./${STAGE_DIRECTORY}/${plugin.alias}.mjs`;
  });
  const configPath = path.join(stage, `${STAGE_DIRECTORY}rc.json`);
  writeFileSync(configPath, JSON.stringify(stageConfig(translation, jsPlugins), null, 2));
  return configPath;
}

function stageConfig(translation, jsPlugins) {
  const categories = [
    'correctness',
    'suspicious',
    'pedantic',
    'perf',
    'restriction',
    'style',
    'nursery',
  ];
  return {
    plugins: ['typescript', 'vitest'],
    jsPlugins,
    categories: Object.fromEntries(categories.map((category) => [category, 'off'])),
    overrides: translation.overrides,
  };
}

function lintUntilAccepted({ plan, environment, ...settings }) {
  const context = {
    plan,
    environment,
    ...settings,
    native: nativeRules(environment),
    files: plan.groups.flatMap((group) => group.files),
    bridgedRules: new Set(PARITY_BRIDGED_RULES),
  };
  const attempts = Array.from({ length: MAX_CONFIGURATION_ATTEMPTS }, () => context);
  for (const attempt of attempts) {
    const outcome = lintAttempt(attempt);
    if (outcome.results !== undefined) return outcome;
  }
  throw new Error('oxlint rejected the lint configuration too many times');
}

function lintAttempt({
  plan,
  stage,
  projectRoot,
  native,
  bridgedRules,
  neutralized,
  directiveFiles,
  ...run
}) {
  const translation = translatePlan(plan, { ...native, bridgedRules });
  const sampleFile = plan.groups[0]?.files[0];
  const configPath = writeStageConfig({ stage, projectRoot, sampleFile, translation });
  rewriteDirectiveComments({
    stage,
    projectRoot,
    directiveFiles,
    ruleNames: translation.ruleNames,
  });
  const naming = {
    ruleNames: translation.ruleNames,
    messageIdOf: messageIdResolver(plan.ruleMessages),
    neutralized,
  };
  try {
    return {
      translation,
      results: lintStage({ stage, configPath, translation, naming, ...run }),
    };
  } catch (error) {
    bridgeRejectedRules(error, translation.ruleNames, bridgedRules);
    return { translation, results: undefined };
  }
}

function bridgeRejectedRules(error, ruleNames, bridgedRules) {
  const rejected = rejectedRuleIds(String(error.message), ruleNames);
  if (rejected.length === 0 || rejected.every((ruleId) => bridgedRules.has(ruleId))) throw error;
  for (const ruleId of rejected) bridgedRules.add(ruleId);
}

function lintStage({ stage, configPath, files, translation, naming, environment, timeoutMs }) {
  const typeAwareEnvironment = translation.typeAware
    ? { OXLINT_TSGOLINT_PATH: tsgolintBinary() }
    : {};
  return argumentChunks(files).flatMap((chunk) => {
    const report = spawnJson(
      [
        oxlintBinary(),
        '--config',
        configPath,
        '--format',
        'json',
        '--no-ignore',
        '--disable-nested-config',
        '--report-unused-disable-directives',
        ...(translation.typeAware ? ['--type-aware'] : []),
        ...chunk,
      ],
      {
        cwd: stage,
        env: { ...environment, ...typeAwareEnvironment },
        context: 'oxlint',
        timeoutMs,
        acceptedStatuses: [0, 1],
      },
    );
    return eslintShapedResults(stage, report.diagnostics, naming);
  });
}

function argumentChunks(files) {
  const chunks = [[]];
  let size = 0;
  for (const file of files) {
    if (size + file.length > MAX_ARGUMENT_BYTES && chunks.at(-1).length > 0) {
      chunks.push([]);
      size = 0;
    }
    chunks.at(-1).push(file);
    size += file.length + 1;
  }
  return chunks.filter((chunk) => chunk.length > 0);
}

function eslintShapedResults(stage, diagnostics, naming) {
  const reported = distinctDiagnostics(diagnostics).filter(
    (diagnostic) => !isIgnoredDiagnostic(diagnostic),
  );
  const byFile = Map.groupBy(reported, (diagnostic) => diagnostic.filename);
  return [...byFile].map(([filename, fileDiagnostics]) => {
    const filePath = filename.replaceAll('\\', '/');
    const locate = byteLocator(readFileSync(path.join(stage, filename)));
    const neutralized = naming.neutralized.get(filePath) ?? new Set();
    return {
      filePath,
      messages: fileDiagnostics
        .map((diagnostic) => eslintMessage(diagnostic, naming, locate))
        .filter((message) => !isNeutralizerWhitespace(message, neutralized)),
    };
  });
}

function distinctDiagnostics(diagnostics) {
  const seen = new Set();
  return diagnostics.filter((diagnostic) => {
    const key = JSON.stringify([
      diagnostic.filename,
      diagnostic.code,
      diagnostic.labels?.[0]?.span?.offset,
    ]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isNeutralizerWhitespace(message, neutralized) {
  return (
    message.ruleId === IRREGULAR_WHITESPACE_RULE &&
    neutralized.has(`${String(message.line)}:${String(message.column)}`)
  );
}

function isIgnoredDiagnostic(diagnostic) {
  if (diagnostic.code === TSCONFIG_ERROR_CODE) {
    const text = `${diagnostic.message} ${diagnostic.help ?? ''}`;
    return TOLERATED_TSCONFIG_ERRORS.some((pattern) => pattern.test(text));
  }
  return diagnostic.code === undefined && diagnostic.message.startsWith('Unused oxlint-');
}

function isUnusedEslintDirective(diagnostic) {
  return diagnostic.code === undefined && diagnostic.message.startsWith('Unused eslint-');
}

function eslintMessage(diagnostic, { ruleNames, messageIdOf }, locate) {
  const span = diagnostic.labels?.[0]?.span ?? { offset: 0, length: 0 };
  const start = locate(span.offset);
  const end = locate(span.offset + span.length);
  const key = reportedRuleKey(diagnostic.code);
  const position = {
    line: start.line,
    column: start.column,
    endLine: end.line,
    endColumn: end.column,
  };
  if (isUnusedEslintDirective(diagnostic)) {
    return { ruleId: undefined, message: diagnostic.message, severity: 1, ...position };
  }
  if (key === undefined) {
    return { fatal: true, message: diagnostic.message, severity: 2, ...position };
  }
  const ruleId = ruleNames.get(key);
  if (ruleId === undefined) {
    throw new Error(
      `oxlint reported ${diagnostic.code}: ${diagnostic.message} ${diagnostic.help ?? ''}`.trim(),
    );
  }
  const message = withoutSentinelHint(diagnostic.message);
  return { ruleId, messageId: messageIdOf(ruleId, message), message, severity: 2, ...position };
}

function withoutSentinelHint(message) {
  return message.replace(SENTINEL_HINT, '');
}

function byteLocator(bytes) {
  const lineStarts = [hasByteOrderMark(bytes) ? 3 : 0];
  for (const index of bytes.keys()) {
    const breakLength = lineBreakLengthAt(bytes, index);
    if (breakLength > 0) lineStarts.push(index + breakLength);
  }
  return (offset) => {
    const lineIndex = lastLineStartAtOrBefore(lineStarts, offset);
    const prefix = bytes.subarray(lineStarts[lineIndex], offset).toString('utf8');
    return { line: lineIndex + 1, column: prefix.length + 1 };
  };
}

function hasByteOrderMark(bytes) {
  return bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
}

function lineBreakLengthAt(bytes, index) {
  if (bytes[index] === 0x0a) return 1;
  if (bytes[index] === 0x0d) return bytes[index + 1] === 0x0a ? 0 : 1;
  const isSeparator =
    bytes[index] === 0xe2 &&
    bytes[index + 1] === 0x80 &&
    (bytes[index + 2] === 0xa8 || bytes[index + 2] === 0xa9);
  return isSeparator ? 3 : 0;
}

function lastLineStartAtOrBefore(lineStarts, offset) {
  return lineStarts.findLastIndex((lineStart) => lineStart <= offset);
}

function neutralizeInlineConfig(stage, projectRoot, files) {
  const neutralized = new Map();
  const results = files.flatMap((file) => {
    const text = readFileSync(path.join(projectRoot, file), 'utf8');
    const directives = directiveComments(text, file);
    if (directives.length === 0) return [];
    overlayFile({
      stage,
      projectRoot,
      relativePath: file,
      content: withoutDirectives(text, directives),
    });
    neutralized.set(
      file,
      new Set(directives.map(({ neutralizedLocation }) => neutralizedLocation)),
    );
    const messages = inlineConfigMessages(directives);
    return messages.length === 0 ? [] : [{ filePath: file, messages }];
  });
  return { results, neutralized };
}

function directiveFilesOf(projectRoot, files, noInlineConfig) {
  const locked = new Set(noInlineConfig);
  return files
    .filter((file) => !locked.has(file))
    .map((file) => ({ file, text: readFileSync(path.join(projectRoot, file), 'utf8') }))
    .filter(({ text }) => text.includes('eslint-') || text.includes('oxlint-'))
    .map(({ file, text }) => ({ file, text, directives: directiveComments(text, file) }))
    .filter(({ directives }) => directives.length > 0);
}

function oxlintDirectives(directives) {
  return directives.filter(({ isEslint }) => !isEslint);
}

function oxlintDirectiveLocations(directiveFiles) {
  return directiveFiles
    .map(({ file, directives }) => [
      file,
      new Set(oxlintDirectives(directives).map(({ neutralizedLocation }) => neutralizedLocation)),
    ])
    .filter(([, locations]) => locations.size > 0);
}

function rewriteDirectiveComments({ stage, projectRoot, directiveFiles, ruleNames }) {
  const renames = new Map(
    [...ruleNames]
      .filter(([oxlintName]) => oxlintName.startsWith('js-'))
      .map(([oxlintName, ruleId]) => [ruleId, oxlintName]),
  );
  for (const { file, text, directives } of directiveFiles) {
    const content = withRenamedRules(
      withoutDirectives(text, oxlintDirectives(directives)),
      directives,
      renames,
    );
    if (content !== text) overlayFile({ stage, projectRoot, relativePath: file, content });
  }
}

function residualResults(projectRoot, residual, runEslintCli) {
  if (residual.length === 0) return [];
  const files = [...new Set(residual.flatMap((group) => group.files))].sort();
  const rules = [...new Set(residual.flatMap((group) => group.rules))].sort();
  return runEslintCli(files, { NITPICKER_DIFF_ESLINT_ONLY_RULES: JSON.stringify(rules) }).map(
    (result) => ({
      filePath: path.relative(projectRoot, result.filePath).replaceAll('\\', '/'),
      messages: result.messages.filter((message) => rules.includes(message.ruleId)),
    }),
  );
}

function mergeResults(results) {
  const byFile = new Map();
  for (const result of results) {
    byFile.set(result.filePath, [...(byFile.get(result.filePath) ?? []), ...result.messages]);
  }
  return [...byFile]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([filePath, messages]) => ({ filePath, messages: messages.sort(byPosition) }));
}

function byPosition(left, right) {
  return (
    left.line - right.line ||
    left.column - right.column ||
    String(left.ruleId).localeCompare(String(right.ruleId)) ||
    left.message.localeCompare(right.message)
  );
}

function spawnJson(argumentList, { cwd, env, context, timeoutMs, acceptedStatuses = [0] }) {
  const result = spawnSync(process.execPath, argumentList, {
    cwd,
    env,
    encoding: 'utf8',
    maxBuffer: MAX_OUTPUT_BYTES,
    timeout: timeoutMs,
  });
  if (result.error !== undefined) {
    throw new Error(`${context} failed: ${result.error.message}`, { cause: result.error });
  }
  if (!acceptedStatuses.includes(result.status)) {
    const detail = result.stderr.trim() || result.stdout.trim() || 'no diagnostic output';
    throw new Error(`${context} exited with ${String(result.status)}: ${detail}\n${ENGINE_HINT}`);
  }
  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    const detail = (result.stderr.trim() || result.stdout).slice(0, 2000);
    throw new Error(`${context} did not produce valid JSON: ${detail}`, { cause: error });
  }
}
