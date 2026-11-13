import { rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { trackTemporaryPath, untrackTemporaryPath } from '../typed/tooling.mts';
import { fieldOf } from '../../../../shared/values/readers.mts';
import type { LintEngineOptions, RunEslintCli } from '../lint-engine/typed/tools.mts';
import {
  type LintResult,
  type NativeRules,
  type OxlintPlan,
  type ResidualGroup,
  type Translation,
  lintResultsOf,
  planOf,
} from './plan/oxlint-shapes.mts';
import { type LintTiming, type StageRun, lintConfigs } from './run/stage-lint.mts';
import { checkoutModuleUrl } from '../../../../shared/paths/checkout-module.mjs';
import { oxlintBinary, spawnJson } from './oxlint-process.mts';
import type { Environment } from '../../../../shared/processes/environment.mts';
import {
  messageIdResolver,
  nativeRuleIndex,
  PARITY_BRIDGED_RULES,
  rejectedRuleIds,
  translatePlan,
} from './oxlint-translation.mts';
import {
  type DirectiveFile,
  directiveFilesOf,
  neutralizeInlineConfig,
  oxlintDirectiveLocations,
  rewriteDirectiveComments,
} from './stage/oxlint-directives.mts';
import {
  type StageConfig,
  createStage,
  hideNestedTypeScriptConfigs,
  writeStageConfigs,
} from './stage/oxlint-stage.mts';

type AttemptContext = LintTiming & {
  readonly plan: OxlintPlan;
  readonly stage: string;
  readonly projectRoot: string;
  readonly runEslintCli: RunEslintCli;
  readonly neutralized: ReadonlyMap<string, ReadonlySet<string>>;
  readonly directiveFiles: readonly DirectiveFile[];
  readonly native: { readonly nativeRules: NativeRules };
  readonly bridgedRules: Set<string>;
  readonly residualRuns: Map<string, Promise<LintResult[]>>;
};

type Accepted = { readonly results: LintResult[]; readonly residual: LintResult[] };

type Outcome = Accepted | { readonly results: undefined };

const PLAN_PATH = fileURLToPath(checkoutModuleUrl(new URL('oxlint-plan.mjs', import.meta.url)));
const MAX_CONFIGURATION_ATTEMPTS = 20;

export async function lintWithOxlint({
  options,
  environment,
  projectConfigPath,
  runEslintCli,
}: {
  readonly options: LintEngineOptions;
  readonly environment: Environment;
  readonly projectConfigPath: string | undefined;
  readonly runEslintCli: RunEslintCli;
}): Promise<LintResult[]> {
  const plan = planOf(
    spawnJson([PLAN_PATH, options.projectRoot, ...options.patterns], {
      cwd: options.projectRoot,
      env: environment,
      context: 'oxlint planning',
      timeoutMs: options.timeoutMs,
    }),
  );
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

async function lintUntilAccepted({
  plan,
  environment,
  ...run
}: Omit<AttemptContext, 'native' | 'bridgedRules' | 'residualRuns'>): Promise<Accepted> {
  const context: AttemptContext = {
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
}: AttemptContext): Promise<Outcome> {
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

function residualRun(
  residualRuns: Map<string, Promise<LintResult[]>>,
  residual: readonly ResidualGroup[],
  start: () => Promise<LintResult[]>,
): Promise<LintResult[]> {
  const key = JSON.stringify(residual);
  const running = residualRuns.get(key) ?? start();
  residualRuns.set(key, running);
  return running;
}

async function lintBesideResidual({
  residual,
  translation,
  bridgedRules,
  ...run
}: StageRun & {
  readonly residual: Promise<LintResult[]>;
  readonly translation: Translation;
  readonly bridgedRules: Set<string>;
  readonly configs: readonly StageConfig[];
}): Promise<Outcome> {
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

function checkNativeConfigs({
  stage,
  configs,
  sampleFile,
  environment,
  timeoutMs,
}: LintTiming & {
  readonly stage: string;
  readonly configs: readonly StageConfig[];
  readonly sampleFile: string | undefined;
}): void {
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

function bridgeRejectedRules(
  error: unknown,
  ruleNames: ReadonlyMap<string, string>,
  bridgedRules: Set<string>,
): void {
  const rejected = rejectedRuleIds(String(fieldOf(error, 'message')), ruleNames);
  if (rejected.length === 0 || rejected.every((ruleId) => bridgedRules.has(ruleId))) throw error;
  for (const ruleId of rejected) bridgedRules.add(ruleId);
}

async function residualResults(
  projectRoot: string,
  residual: readonly ResidualGroup[],
  runEslintCli: RunEslintCli,
): Promise<LintResult[]> {
  if (residual.length === 0) return [];
  const files = [...new Set(residual.flatMap((group) => group.files))].sort();
  const rules = [...new Set(residual.flatMap((group) => group.rules))].sort();
  const results = lintResultsOf(
    await runEslintCli(files, {
      NITPICKER_DIFF_ESLINT_ONLY_RULES: JSON.stringify(rules),
    }),
  );
  return results.map((result) => ({
    filePath: path.relative(projectRoot, result.filePath).replaceAll('\\', '/'),
    messages: result.messages.filter(
      (message) => message.ruleId !== undefined && rules.includes(message.ruleId),
    ),
  }));
}

function mergeResults(results: readonly LintResult[]): LintResult[] {
  const byFile = new Map<string, LintResult['messages'][number][]>();
  for (const result of results) {
    byFile.set(result.filePath, [...(byFile.get(result.filePath) ?? []), ...result.messages]);
  }
  return [...byFile]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([filePath, messages]) => ({ filePath, messages: messages.sort(byPosition) }));
}

function byPosition(
  left: LintResult['messages'][number],
  right: LintResult['messages'][number],
): number {
  return (
    left.line - right.line ||
    left.column - right.column ||
    String(left.ruleId).localeCompare(String(right.ruleId)) ||
    left.message.localeCompare(right.message)
  );
}
