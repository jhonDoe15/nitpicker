import { ALL_RECIPES } from '../fix/engine/all-recipes.mjs';
import { fixWorkingTree } from '../fix/run-fix.mts';

export const FIX_RECIPES: unknown = ALL_RECIPES;
import type { TextOutput } from '../cli-context.mts';
import { fixAnalysis, type VerifyCli } from './fix/verify-analysis.mts';
import { clearDryRunOutput, reportDryRun } from './fix/dry-run-report.mts';
import type { DryRunPlan } from './fix/dry-run-report.mts';

type FixCli = VerifyCli & {
  readonly options: {
    readonly fix: boolean;
    readonly dryRun: boolean;
    readonly ruleFilters: readonly string[];
    readonly verify?: string | undefined;
  };
  readonly executeFixCommand?: unknown;
  readonly config: unknown;
  readonly scope: unknown;
  readonly environment: NodeJS.ProcessEnv;
  readonly spawnEnvironment: NodeJS.ProcessEnv;
  readonly stdout: TextOutput;
  readonly outputRoot: string;
  readonly fixRecipes?: unknown;
};

type FixResult = {
  readonly dryRun?: DryRunPlan;
  readonly fixedFiles: readonly string[];
  readonly toolErrors: readonly unknown[];
  readonly fixedFindings?: readonly string[];
  readonly notes?: readonly string[];
};

const fixTree: (options: object) => FixResult = fixWorkingTree;

function writeNotes(cli: FixCli, notes: readonly string[], heading = 'Fix notes'): void {
  if (notes.length > 0) {
    cli.stdout.write(`${heading}:\n${notes.map((note) => `  ${note}\n`).join('')}`);
  }
}

export function fixIfRequested(
  cli: FixCli,
  repositoryRoot: string,
  base: { readonly baseRef: unknown },
): FixResult {
  if (!cli.options.fix) {
    return { fixedFiles: [], toolErrors: [] };
  }
  if (!cli.options.dryRun) {
    clearDryRunOutput(cli.outputRoot);
  }
  const fixResult = fixTree({
    repositoryRoot,
    projectRoot: cli.currentProjectRoot,
    baseRef: base.baseRef,
    executeFixCommand: cli.executeFixCommand,
    headPolicy: cli.headPolicy,
    config: cli.config,
    scope: cli.scope,
    environment: cli.environment,
    spawnEnvironment: cli.spawnEnvironment,
    dryRun: cli.options.dryRun,
    selectedRules: cli.options.ruleFilters,
    recipes: cli.fixRecipes,
    analyzeFixes: fixAnalysis(cli),
    verifyMode: cli.options.verify === 'full' ? 'full' : 'narrow',
  });
  if (fixResult.dryRun !== undefined) {
    reportDryRun(cli.stdout, cli.outputRoot, fixResult.dryRun);
    writeNotes(cli, fixResult.notes ?? [], 'Fix notes (from the dry run)');
    return fixResult;
  }
  cli.stdout.write(
    `Fixed files:\n${fixResult.fixedFiles.length === 0 ? '(none)\n' : `${fixResult.fixedFiles.join('\n')}\n`}`,
  );
  const fixedFindings = fixResult.fixedFindings ?? [];
  if (fixedFindings.length > 0) {
    cli.stdout.write(`Fixed findings:\n${fixedFindings.map((line) => `  ${line}\n`).join('')}`);
  }
  writeNotes(cli, fixResult.notes ?? []);
  return fixResult;
}
