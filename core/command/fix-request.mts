import { realpathSync } from 'node:fs';
import path from 'node:path';
import { ALL_RECIPES } from '../fix/engine/all-recipes.mjs';
import { fixWorkingTree } from '../fix/run-fix.mts';
import type { FixInvocation, FixOutcome } from '../fix/typed/fix-types.mts';
import { runGit } from '../diff/git/repository/command.mjs';
import { outputRootFor } from '../diff/reporting/reporters.mts';

export const FIX_RECIPES: unknown = ALL_RECIPES;
import type { TextOutput } from '../cli-context.mts';
import { fixAnalysis, type VerifyCli } from './fix/verify-analysis.mts';
import { clearDryRunOutput, reportDryRun } from './fix/dry-run-report.mts';
import { FIX_LOG_FILE, sectionText, writeFixLog, type Section } from './fix/console-lines.mts';

type FixCli = VerifyCli & {
  readonly options: {
    readonly fix: boolean;
    readonly dryRun: boolean;
    readonly all: boolean;
    readonly outputRoot?: string;
    readonly ruleFilters: readonly string[];
    readonly verify?: string | undefined;
  };
  readonly executeFixCommand?: ((invocation: FixInvocation) => unknown) | undefined;
  readonly config: unknown;
  readonly scope: unknown;
  readonly environment: NodeJS.ProcessEnv;
  readonly spawnEnvironment: NodeJS.ProcessEnv;
  readonly stdout: TextOutput;
  readonly outputRoot: string;
  readonly fixRecipes?: unknown;
};

type FixResult = FixOutcome;

function writeSections(cli: FixCli, sections: readonly Section[]): void {
  const logFile = path.join(cli.outputRoot, FIX_LOG_FILE);
  cli.stdout.write(sections.map((section) => sectionText(section, logFile)).join(''));
  writeFixLog(cli.outputRoot, sections);
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
  const fixResult = fixWorkingTree({
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
    allFiles: cli.options.all,
    recipes: cli.fixRecipes,
    analyzeFixes: fixAnalysis(cli),
    verifyMode: cli.options.verify === 'full' ? 'full' : 'narrow',
  });
  if (fixResult.dryRun !== undefined) {
    reportDryRun(cli.stdout, cli.outputRoot, fixResult.dryRun);
    writeSections(cli, [{ heading: 'Fix notes (from the dry run)', lines: fixResult.notes ?? [] }]);
    return fixResult;
  }
  writeSections(cli, [
    {
      heading: 'Fixed files',
      lines: fixResult.fixedFiles.length === 0 ? ['(none)'] : fixResult.fixedFiles,
      indent: '',
    },
    { heading: 'Fixed findings', lines: fixResult.fixedFindings ?? [] },
    { heading: 'Fix notes', lines: fixResult.notes ?? [] },
  ]);
  return fixResult;
}

type SnapshotFixCli = Omit<
  FixCli,
  'config' | 'currentProjectRoot' | 'scope' | 'headPolicy' | 'outputRoot'
> & {
  readonly stderr: TextOutput;
};

type SnapshotFixRun = {
  readonly currentProjectRoot: string;
  readonly config: unknown;
  readonly scope: unknown;
  readonly headPolicy: unknown;
  readonly setup: { readonly analyzers: unknown; readonly quick: unknown };
};

const outputRootOf: (root: string, requested: string | undefined, name: string) => string =
  outputRootFor;

export function fixAllFilesIfRequested(
  cli: SnapshotFixCli,
  run: SnapshotFixRun,
): readonly unknown[] {
  if (!cli.options.fix) {
    return [];
  }
  const repositoryRoot = realpathSync(
    runGit(run.currentProjectRoot, ['rev-parse', '--show-toplevel']).trim(),
  );
  const result = fixIfRequested(
    {
      ...cli,
      currentProjectRoot: run.currentProjectRoot,
      config: run.config,
      scope: run.scope,
      headPolicy: run.headPolicy,
      analyzers: run.setup.analyzers,
      outputRoot: outputRootOf(run.currentProjectRoot, cli.options.outputRoot, 'snapshot'),
    },
    repositoryRoot,
    { baseRef: undefined },
  );
  for (const error of result.toolErrors) {
    cli.stderr.write(`nitpicker: fix tool error: ${JSON.stringify(error)}\n`);
  }
  return result.toolErrors;
}
