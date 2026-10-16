import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  trackTemporaryPath,
  untrackTemporaryPath,
} from '../../../../core/tooling/temporary-files.mjs';
import { eslintShapedResults } from './oxlint-diagnostics.mjs';
import { oxlintBinary, spawnJson, tsgolintBinary } from './oxlint-process.mjs';
import {
  messageIdResolver,
  nativeRuleIndex,
  PARITY_BRIDGED_RULES,
  rejectedRuleIds,
  translatePlan,
} from './oxlint-translation.mjs';
import {
  directiveFilesOf,
  neutralizeInlineConfig,
  oxlintDirectiveLocations,
  rewriteDirectiveComments,
} from './stage/oxlint-directives.mjs';
import {
  createStage,
  hideNestedTypeScriptConfigs,
  writeStageConfigs,
} from './stage/oxlint-stage.mjs';

const MAX_ARGUMENT_BYTES = 1024 * 1024;
const MAX_CONFIGURATION_ATTEMPTS = 20;

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
    const screening = screenedResults(results, translation.screenedRules);
    return mergeResults([
      ...screening.results,
      ...inlineConfig.results,
      ...residualResults(options.projectRoot, translation.residual, {
        ...screening,
        screenedRules: translation.screenedRules,
        runEslintCli,
      }),
    ]).map((result) => ({ ...result, filePath: path.join(options.projectRoot, result.filePath) }));
  } finally {
    rmSync(stage, { recursive: true, force: true });
    untrackTemporaryPath(stage);
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

function lintUntilAccepted({ plan, environment, ...run }) {
  const context = {
    plan,
    environment,
    ...run,
    native: nativeRules(environment),
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
  const configs = writeStageConfigs({ stage, projectRoot, sampleFile, translation });
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
    checkNativeConfigs({ stage, configs, sampleFile, ...run });
    return {
      translation,
      results: configs.flatMap((config) =>
        lintStage({ stage, ...config, typeAware: translation.typeAware, naming, ...run }),
      ),
    };
  } catch (error) {
    bridgeRejectedRules(error, translation.ruleNames, bridgedRules);
    return { translation, results: undefined };
  }
}

function checkNativeConfigs({ stage, configs, sampleFile, environment, timeoutMs }) {
  if (sampleFile === undefined) return;
  for (const { nativeConfigPath } of configs) {
    spawnJson(
      [
        oxlintBinary(),
        '--config',
        nativeConfigPath,
        '--format',
        'json',
        '--no-ignore',
        '--disable-nested-config',
        sampleFile,
      ],
      { cwd: stage, env: environment, context: 'oxlint', timeoutMs, acceptedStatuses: [0, 1] },
    );
  }
}

function bridgeRejectedRules(error, ruleNames, bridgedRules) {
  const rejected = rejectedRuleIds(String(error.message), ruleNames);
  if (rejected.length === 0 || rejected.every((ruleId) => bridgedRules.has(ruleId))) throw error;
  for (const ruleId of rejected) bridgedRules.add(ruleId);
}

function lintStage({ stage, configPath, files, typeAware, naming, environment, timeoutMs }) {
  const typeAwareEnvironment = typeAware ? { OXLINT_TSGOLINT_PATH: tsgolintBinary() } : {};
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
        ...(typeAware ? ['--type-aware'] : []),
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

function screenedResults(results, screenedRules) {
  const candidates = new Set(
    results
      .filter(({ messages }) => messages.some(({ ruleId }) => screenedRules.has(ruleId)))
      .map(({ filePath }) => filePath),
  );
  return {
    candidates,
    results: results.map((result) => ({
      ...result,
      messages: result.messages.filter(({ ruleId }) => !screenedRules.has(ruleId)),
    })),
  };
}

function residualFiles(group, { screenedRules, candidates }) {
  return group.rules.every((ruleId) => screenedRules.has(ruleId))
    ? group.files.filter((file) => candidates.has(file))
    : group.files;
}

function residualResults(projectRoot, residual, { runEslintCli, ...screening }) {
  const files = [...new Set(residual.flatMap((group) => residualFiles(group, screening)))].sort();
  if (files.length === 0) return [];
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
