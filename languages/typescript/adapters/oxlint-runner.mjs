import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
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
  overlayFile,
  withoutDirectives,
} from './oxlint-inline-config.mjs';
import { resolveTool } from '../../../core/tooling/tool-resolution.mjs';
import {
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
const TSCONFIG_ERROR_CODE = 'typescript(tsconfig-error)';

export function lintWithOxlint({ options, environment, projectConfigPath, runEslintCli }) {
  const plan = spawnJson(
    [path.join(import.meta.dirname, 'oxlint-plan.mjs'), options.projectRoot, ...options.patterns],
    { cwd: options.projectRoot, env: environment, context: 'oxlint planning' },
  );
  const stage = createStage(options.projectRoot, projectConfigPath);
  try {
    const inlineConfig = neutralizeInlineConfig(stage, options.projectRoot, plan.noInlineConfig);
    const { translation, results } = lintUntilAccepted({
      plan,
      stage,
      projectRoot: options.projectRoot,
      environment,
    });
    return mergeResults([
      ...results,
      ...inlineConfig,
      ...residualResults(options.projectRoot, translation.residual, runEslintCli),
    ]).map((result) => ({ ...result, filePath: path.join(options.projectRoot, result.filePath) }));
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
}

function oxlintBinary() {
  return resolveTool('oxlint', { bin: 'bin/oxlint' }).binPath;
}

function tsgolintBinary() {
  const packageRoot = path.dirname(resolveTool('oxlint-tsgolint', { bin: 'package.json' }).binPath);
  const executable = process.platform === 'win32' ? 'tsgolint.exe' : 'tsgolint';
  return createRequire(path.join(packageRoot, 'package.json')).resolve(
    `@oxlint-tsgolint/${process.platform}-${process.arch}/${executable}`,
  );
}

function nativeRules(environment) {
  const listed = spawnJson([oxlintBinary(), '--rules', '--format', 'json'], {
    cwd: tmpdir(),
    env: environment,
    context: 'oxlint rule listing',
  });
  return { nativeRules: nativeRuleIndex(listed) };
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

function lintUntilAccepted({ plan, stage, projectRoot, environment }) {
  const context = {
    plan,
    stage,
    projectRoot,
    environment,
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

function lintAttempt({ plan, stage, projectRoot, environment, native, files, bridgedRules }) {
  const translation = translatePlan(plan, { ...native, bridgedRules });
  const sampleFile = plan.groups[0]?.files[0];
  const configPath = writeStageConfig({ stage, projectRoot, sampleFile, translation });
  try {
    return {
      translation,
      results: lintStage({ stage, configPath, files, translation, environment }),
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

function lintStage({ stage, configPath, files, translation, environment }) {
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
        env: { ...environment, OXLINT_TSGOLINT_PATH: tsgolintBinary() },
        context: 'oxlint',
        acceptedStatuses: [0, 1],
      },
    );
    return eslintShapedResults(stage, report.diagnostics, translation.ruleNames);
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

function eslintShapedResults(stage, diagnostics, ruleNames) {
  const reported = diagnostics.filter((diagnostic) => !isIgnoredDiagnostic(diagnostic));
  const byFile = Map.groupBy(reported, (diagnostic) => diagnostic.filename);
  return [...byFile].map(([filename, fileDiagnostics]) => {
    const locate = byteLocator(readFileSync(path.join(stage, filename)));
    return {
      filePath: filename.replaceAll('\\', '/'),
      messages: fileDiagnostics.map((diagnostic) => eslintMessage(diagnostic, ruleNames, locate)),
    };
  });
}

function isIgnoredDiagnostic(diagnostic) {
  return (
    diagnostic.code === TSCONFIG_ERROR_CODE ||
    (diagnostic.code === undefined && diagnostic.message.startsWith('Unused oxlint-'))
  );
}

function isUnusedEslintDirective(diagnostic) {
  return diagnostic.code === undefined && diagnostic.message.startsWith('Unused eslint-');
}

function eslintMessage(diagnostic, ruleNames, locate) {
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
  return { ruleId, message: withoutSentinelHint(diagnostic.message), severity: 2, ...position };
}

function withoutSentinelHint(message) {
  return message.replace(SENTINEL_HINT, '');
}

function byteLocator(bytes) {
  const lineStarts = [0];
  for (const [index, byte] of bytes.entries()) {
    if (byte === 0x0a) lineStarts.push(index + 1);
  }
  return (offset) => {
    const lineIndex = lastLineStartAtOrBefore(lineStarts, offset);
    const prefix = bytes.subarray(lineStarts[lineIndex], offset).toString('utf8');
    return { line: lineIndex + 1, column: prefix.length + 1 };
  };
}

function lastLineStartAtOrBefore(lineStarts, offset) {
  return lineStarts.findLastIndex((lineStart) => lineStart <= offset);
}

function neutralizeInlineConfig(stage, projectRoot, files) {
  return files.flatMap((file) => {
    const text = readFileSync(path.join(projectRoot, file), 'utf8');
    const directives = directiveComments(text, file);
    if (directives.length === 0) return [];
    overlayFile({
      stage,
      projectRoot,
      relativePath: file,
      content: withoutDirectives(text, directives),
    });
    const messages = inlineConfigMessages(directives);
    return messages.length === 0 ? [] : [{ filePath: file, messages }];
  });
}

function residualResults(projectRoot, residual, runEslintCli) {
  if (residual.length === 0) return [];
  const files = [...new Set(residual.flatMap((group) => group.files))].sort();
  const rules = [...new Set(residual.flatMap((group) => group.rules))].sort();
  return runEslintCli(files, { NITPICKER_DIFF_ESLINT_ONLY_RULES: JSON.stringify(rules) }).map(
    (result) => ({
      ...result,
      filePath: path.relative(projectRoot, result.filePath).replaceAll('\\', '/'),
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

function spawnJson(argumentList, { cwd, env, context, acceptedStatuses = [0] }) {
  const result = spawnSync(process.execPath, argumentList, {
    cwd,
    env,
    encoding: 'utf8',
    maxBuffer: MAX_OUTPUT_BYTES,
  });
  if (result.error !== undefined) throw result.error;
  if (!acceptedStatuses.includes(result.status)) {
    const detail = result.stderr.trim() || result.stdout.trim() || 'no diagnostic output';
    throw new Error(`${context} exited with ${String(result.status)}: ${detail}`);
  }
  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    const detail = (result.stderr.trim() || result.stdout).slice(0, 2000);
    throw new Error(`${context} did not produce valid JSON: ${detail}`, { cause: error });
  }
}
