import { rmSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import path from 'node:path';
import {
  trackTemporaryPath,
  untrackTemporaryPath,
} from '../../../../core/tooling/temporary-files.mjs';
import { eslintShapedResults } from './oxlint-diagnostics.mjs';
import { checkoutModulePath } from '../../../../shared/paths/checkout-module.mjs';
import { oxlintBinary, spawnJson, spawnJsonAsync, tsgolintBinary } from './oxlint-process.mjs';
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
const PLAN_PATH = checkoutModulePath(path.join(import.meta.dirname, 'oxlint-plan.mjs'));
const MAX_CONFIGURATION_ATTEMPTS = 20;
const MAX_LINT_SLICES = 4;
const MIN_FILES_PER_SLICE = 200;
const CPUS_PER_LINT_SLICE = 4;

export async function lintWithOxlint({ options, environment, projectConfigPath, runEslintCli }) {
  const plan = spawnJson([PLAN_PATH, options.projectRoot, ...options.patterns], {
    cwd: options.projectRoot,
    env: environment,
    context: 'oxlint planning',
    timeoutMs: options.timeoutMs,
  });
  const files = plan.groups.flatMap((group) => group.files);
  const stage = trackTemporaryPath(createStage(options.projectRoot, projectConfigPath));
  try {
    if (projectConfigPath !== undefined) {
      hideNestedTypeScriptConfigs(stage, options.projectRoot, files);
    }
    const inlineConfig = neutralizeInlineConfig(stage, options.projectRoot, plan.noInlineConfig);
    const directiveFiles = directiveFilesOf(options.projectRoot, files, plan.noInlineConfig);
    const { results, residual } = await lintUntilAccepted({
      plan,
      stage,
      projectRoot: options.projectRoot,
      runEslintCli,
      environment,
      timeoutMs: options.timeoutMs,
      neutralized: new Map([
        ...inlineConfig.neutralized,
        ...oxlintDirectiveLocations(directiveFiles),
      ]),
      directiveFiles,
    });
    return mergeResults([...results, ...inlineConfig.results, ...residual]).map((result) => ({
      ...result,
      filePath: path.join(options.projectRoot, result.filePath),
    }));
  } finally {
    rmSync(stage, { recursive: true, force: true });
    untrackTemporaryPath(stage);
  }
}

async function lintUntilAccepted({ plan, environment, ...run }) {
  const context = {
    plan,
    environment,
    ...run,
    native: { nativeRules: nativeRuleIndex(plan.nativeRules) },
    bridgedRules: new Set(PARITY_BRIDGED_RULES),
    residualRuns: new Map(),
  };
  const attempts = Array.from({ length: MAX_CONFIGURATION_ATTEMPTS }, () => context);
  for (const attempt of attempts) {
    const outcome = await lintAttempt(attempt);
    if (outcome.results !== undefined) return outcome;
  }
  throw new Error('oxlint rejected the lint configuration too many times');
}

async function lintAttempt({
  plan,
  stage,
  projectRoot,
  runEslintCli,
  residualRuns,
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
  try {
    checkNativeConfigs({ stage, configs, sampleFile, ...run });
  } catch (error) {
    bridgeRejectedRules(error, translation.ruleNames, bridgedRules);
    return { results: undefined };
  }
  const naming = {
    ruleNames: translation.ruleNames,
    messageIdOf: messageIdResolver(plan.ruleMessages),
    ruleMessages: plan.ruleMessages,
    neutralized,
  };
  return lintBesideResidual({
    residual: residualRun(residualRuns, translation.residual, () =>
      residualResults(projectRoot, translation.residual, runEslintCli),
    ),
    translation,
    bridgedRules,
    stage,
    configs,
    naming,
    ...run,
  });
}

function residualRun(residualRuns, residual, start) {
  const key = JSON.stringify(residual);
  if (!residualRuns.has(key)) {
    residualRuns.set(key, start());
  }
  return residualRuns.get(key);
}

async function lintBesideResidual({ residual, translation, bridgedRules, ...run }) {
  const [linted, residualOutcome] = await Promise.allSettled([
    lintConfigs({ ...run, typeAware: translation.typeAware }),
    residual,
  ]);
  if (linted.status === 'rejected') {
    bridgeRejectedRules(linted.reason, translation.ruleNames, bridgedRules);
  }
  if (residualOutcome.status === 'rejected') {
    throw residualOutcome.reason;
  }
  return linted.status === 'rejected'
    ? { results: undefined }
    : { results: linted.value, residual: residualOutcome.value };
}

async function lintConfigs({ configs, ...run }) {
  const results = [];
  for (const config of configs) {
    const slices = fileSlices(config.files);
    const reports = await Promise.allSettled(
      slices.map((files) => lintStage({ ...run, configPath: config.configPath, files })),
    );
    const failed = reports.find(({ status }) => status === 'rejected');
    if (failed !== undefined) {
      throw failed.reason;
    }
    results.push(...reports.flatMap(({ value }) => value));
  }
  return results;
}

function fileSlices(files) {
  const count = Math.max(
    1,
    Math.min(
      MAX_LINT_SLICES,
      Math.floor(availableParallelism() / CPUS_PER_LINT_SLICE),
      Math.floor(files.length / MIN_FILES_PER_SLICE),
    ),
  );
  return Array.from({ length: count }, (_slice, index) =>
    files.filter((_file, position) => position % count === index),
  );
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

async function lintStage({ stage, configPath, files, typeAware, naming, environment, timeoutMs }) {
  const typeAwareEnvironment = typeAware ? { OXLINT_TSGOLINT_PATH: tsgolintBinary() } : {};
  const results = [];
  for (const chunk of argumentChunks(files)) {
    const report = await spawnJsonAsync(
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
    results.push(...eslintShapedResults(stage, report.diagnostics, naming));
  }
  return results;
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

async function residualResults(projectRoot, residual, runEslintCli) {
  if (residual.length === 0) return [];
  const files = [...new Set(residual.flatMap((group) => group.files))].sort();
  const rules = [...new Set(residual.flatMap((group) => group.rules))].sort();
  const results = await runEslintCli(files, {
    NITPICKER_DIFF_ESLINT_ONLY_RULES: JSON.stringify(rules),
  });
  return results.map((result) => ({
    filePath: path.relative(projectRoot, result.filePath).replaceAll('\\', '/'),
    messages: result.messages.filter((message) => rules.includes(message.ruleId)),
  }));
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
