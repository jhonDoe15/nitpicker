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
  type Translation,
  planOf,
} from './plan/oxlint-shapes.mts';
import { withEngineLint, withTypedCoverage } from './run/engine-pass.mts';
import { ENGINE_FINDINGS_FILE } from '../../../../shared/engine/engine-findings-file.mts';
import { mergeResults } from './run/merged-results.mts';
import { residualResults, residualRun } from './run/residual-run.mts';
import { withTreeFile } from './stage/tree-file.mts';
import { type LintTiming, type StageRun, lintConfigs, settledBeside } from './run/stage-lint.mts';
import { checkoutModuleUrl } from '../../../../shared/paths/checkout-module.mts';
import { seedRepositoryTree } from '../../../../shared/project-files/seeded/seeded-trees.mts';
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
  readonly treeFile: string;
};

type Accepted = { readonly results: LintResult[]; readonly residual: LintResult[] };

type Outcome = Accepted | { readonly results: undefined };

const PLAN_PATH = fileURLToPath(checkoutModuleUrl(new URL('oxlint-plan.mjs', import.meta.url)));
const MAX_CONFIGURATION_ATTEMPTS = 20;

type StagedLint = {
  readonly options: LintEngineOptions;
  readonly environment: Environment;
  readonly projectConfigPath: string | undefined;
  readonly runEslintCli: RunEslintCli;
};

export async function lintWithOxlint(request: StagedLint): Promise<LintResult[]> {
  const { options, environment, projectConfigPath } = request;
  const plan = planFor(options, environment);
  const files = plan.groups.flatMap((group) => group.files);
  const { root, stage } = createStage(options.projectRoot, projectConfigPath);
  trackTemporaryPath(root);
  try {
    if (projectConfigPath !== undefined) {
      hideNestedTypeScriptConfigs(stage, options.projectRoot, files);
    }
    return await withTreeFile((treeFile) =>
      lintStage({ ...request, plan, files, stage, treeFile }),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
    untrackTemporaryPath(root);
  }
}

async function lintStage({
  options,
  environment,
  projectConfigPath,
  runEslintCli,
  plan,
  files,
  stage,
  treeFile,
}: StagedLint & {
  readonly plan: OxlintPlan;
  readonly files: readonly string[];
  readonly stage: string;
  readonly treeFile: string;
}): Promise<LintResult[]> {
  const inlineConfig = neutralizeInlineConfig(stage, options.projectRoot, plan.noInlineConfig);
  const directiveFiles = directiveFilesOf(options.projectRoot, files, plan.noInlineConfig);
  const { projectRoot, timeoutMs } = options;
  const { results, residual } = await withEngineLint(
    { plan, projectRoot, projectConfigPath, environment, timeoutMs },
    (engine) =>
      lintUntilAccepted({
        plan: withTypedCoverage(plan, engine.coverage),
        stage,
        projectRoot,
        runEslintCli,
        environment: engine.environment,
        timeoutMs,
        neutralized: new Map([
          ...inlineConfig.neutralized,
          ...oxlintDirectiveLocations(directiveFiles),
        ]),
        directiveFiles,
        treeFile,
      }),
  );
  return mergeResults([...results, ...inlineConfig.results, ...residual]).map((result) => ({
    ...result,
    filePath: path.join(options.projectRoot, result.filePath),
  }));
}

function planFor(options: LintEngineOptions, environment: Environment): OxlintPlan {
  return planOf(
    spawnJson([PLAN_PATH, options.projectRoot, ...options.patterns], {
      cwd: options.projectRoot,
      env: environment,
      context: 'oxlint planning',
      timeoutMs: options.timeoutMs,
    }),
  );
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

function namingOf(
  plan: OxlintPlan,
  ruleNames: Translation['ruleNames'],
  neutralized: AttemptContext['neutralized'],
) {
  return {
    ruleNames,
    messageIdOf: messageIdResolver(plan.ruleMessages),
    ruleMessages: plan.ruleMessages,
    neutralized,
  };
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
  treeFile,
  environment,
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
  const listedEnvironment = { ...environment, ...seedRepositoryTree(stage, treeFile) };
  try {
    checkNativeConfigs({ stage, configs, sampleFile, environment: listedEnvironment, ...run });
  } catch (error) {
    bridgeRejectedRules(error, translation.ruleNames, bridgedRules);
    return { results: undefined };
  }
  const naming = namingOf(plan, translation.ruleNames, neutralized);
  return lintBesideResidual({
    residual: () =>
      residualRun(residualRuns, translation.residual, () =>
        residualResults(projectRoot, translation.residual, {
          runEslintCli,
          replay: environment[ENGINE_FINDINGS_FILE],
        }),
      ),
    translation,
    bridgedRules,
    stage,
    configs,
    naming,
    environment: listedEnvironment,
    ...run,
  });
}

async function lintBesideResidual({
  residual,
  translation,
  bridgedRules,
  ...run
}: StageRun & {
  readonly residual: () => Promise<LintResult[]>;
  readonly translation: Translation;
  readonly bridgedRules: Set<string>;
  readonly configs: readonly StageConfig[];
}): Promise<Outcome> {
  const [linted, residualOutcome] = await settledBeside(() => lintConfigs(run), residual, run);
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
