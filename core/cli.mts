#!/usr/bin/env node
import { runAggregateCli } from './diff/sharding/aggregate-shards.mts';
import { reportingProgress } from './diff/execution/progress.mts';
import { runScheduler, selectAnalyzers } from './diff/execution/run-analyzers.mts';
import { runChangelogCommand } from './command/changelog/changelog.mts';
import { missingPathHint, parseArguments } from './command/arguments.mts';
import { SUBCOMMANDS } from './command/subcommands/subcommands.mts';
import { resolveRunTarget } from './scope/run-target.mts';
import { realpathSync } from 'node:fs';
import {
  describeConfigOverrides,
  describeDisableCascade,
  loadConfig,
} from './configuration/config.mjs';
import { resolveProjectHeadPolicy } from './conventions/project-head-policy.mjs';
import { configureAll, presetAnalyzers } from './configuration/preset-analyzers.mts';
import { assertProjectPeers } from './init/preflight/project-peers.mts';
import { withRunLock } from './command/run-lock.mts';
import { runSnapshotCli } from './command/snapshot.mts';
import { historyAvailabilityNotes, noticeDescriber } from './command/policy-review/notices.mts';
import { comparisonPolicy, snapshotPolicy } from './conventions/resolve.mjs';
import { runGit } from './diff/git/repository/command.mjs';
import { resolveComparison } from './diff/git/repository/git.mjs';
import { resolveBase } from './diff/git/repository/base-ref.mts';
import { detachLocalGitVariables } from './diff/git/environment/local-variables.mts';
import path from 'node:path';
import { clearDiffReports, outputRootFor } from './diff/reporting/reporters.mts';
import { selectComparisonAnalyzers } from './command/comparison/analyzers.mts';
import { runQualityDiff } from './diff/comparison/run-diff.mts';
import { fixIfRequested } from './command/fix-request.mts';
import { applyRunProfile } from './quick/profile.mts';
import { stagedCapture, withIndexFile } from './staged/capture-index.mts';
import { writeComparisonOutcome } from './command/comparison/outcome.mts';
import { baseSetupResolver } from './command/policy-review/base-setup.mts';
import { runHistoryCli } from '../shared/history/runner.mjs';
import { runHygieneCli } from '../shared/hygiene/runner.mjs';
import { printedInformation } from './command/information/printed-information.mts';
import { GO_ANALYZER_COMMAND, runGoCli } from '../languages/go/adapters/go-runner.mjs';
import { redirectToBundledTypeScriptApi } from '../languages/typescript/typescript-api/api-selection.mjs';
import { describeError } from '../shared/messages/error-chain.mjs';
import { fieldOf, listOf, numberOr, textOf } from '../shared/values/readers.mts';
import {
  type ComparisonCli,
  type ConfiguredCli,
  acceptanceOf,
  resolveRunCacheStore,
  writeNotes,
  writePresetHint,
} from './command/comparison/run-context.mts';
import type {
  CheckCli,
  Cli,
  CliInput,
  CliOptions,
  ConfiguredRun,
  ExitCode,
  RunSetup,
} from './cli-context.mts';
import type { NitpickerConfig } from './configuration/config-types.mts';
import { emptySourcesErrors } from '../languages/typescript/preset/notices/empty-sources.mjs';

const CHECK_COMMANDS: Readonly<Record<string, (cli: CheckCli) => ExitCode>> = {
  hygiene: async (cli) => {
    const { yamlDocuments } = await import('./tooling/yaml/yaml-documents.mjs');
    return runHygieneCli({ ...cli, parseYaml: yamlDocuments });
  },
  history: runHistoryCli,
  [GO_ANALYZER_COMMAND]: runGoCli,
};

export function runCli(options: CliInput = {}): ExitCode {
  const detached = detachLocalGitVariables(process.env);
  const cli = withIndexFile(withCliDefaults(options), detached);
  const [name = ''] = cli.arguments_;
  const checkCommand = CHECK_COMMANDS[name];
  if (checkCommand !== undefined) {
    return checkCommand({
      commandArguments: cli.arguments_.slice(1),
      stdout: cli.stdout,
      stderr: cli.stderr,
      environment: cli.environment,
    });
  }
  if (name === 'aggregate') {
    return runAggregateCli({
      arguments_: cli.arguments_.slice(1),
      currentProjectRoot: cli.currentProjectRoot,
      analyzers: cli.analyzers,
      stdout: cli.stdout,
      stderr: cli.stderr,
      environment: cli.environment,
    });
  }
  try {
    return runCommand(cli);
  } catch (error) {
    const description = textOf(describeError(error)) || 'unknown error';
    cli.stderr.write(`nitpicker failed: ${description}\n`);
    if (wantsJson(cli.arguments_)) {
      cli.stdout.write(`${JSON.stringify({ status: 'error', exitCode: 2, error: description })}\n`);
    }
    return 2;
  }
}

function wantsJson(commandLine: readonly string[]): boolean {
  const [name = ''] = commandLine;
  return !Object.hasOwn(SUBCOMMANDS, name) && commandLine.includes('--json');
}

const HELP_ALIAS = '-h';

function helpFlag(argument: string): string {
  return argument === HELP_ALIAS ? '--help' : argument;
}

function isTerminal(stream: object): boolean {
  return 'isTTY' in stream && stream.isTTY === true;
}

function withCliDefaults(options: CliInput): Omit<Cli, 'indexFile'> {
  const stderr = options.stderr ?? process.stderr;
  const progress = options.progress ?? stderr;
  return {
    ...options,
    analyzers: options.analyzers,
    currentProjectRoot: options.currentProjectRoot,
    workingDirectory: options.workingDirectory,
    arguments_: (options.arguments_ ?? process.argv.slice(2)).map(helpFlag),
    environment: options.environment ?? process.env,
    interactive:
      typeof options.interactive === 'boolean'
        ? options.interactive
        : [process.stdin, options.stdout ?? process.stdout].every(isTerminal),
    snapshotAnalyzers: options.snapshotAnalyzers ?? options.analyzers,
    stdout: options.stdout ?? process.stdout,
    stderr,
    progress,
    runTasks: reportingProgress(options.runTasks ?? runScheduler, progress),
  };
}

function runCommand(cli: Cli): ExitCode {
  const [name = '', ...rest] = cli.arguments_;
  if (name === 'changelog') {
    return runChangelogCommand({ ...cli, arguments_: rest });
  }
  redirectToBundledTypeScriptApi(cli.environment);
  const subcommand = Object.hasOwn(SUBCOMMANDS, name) ? SUBCOMMANDS[name] : undefined;
  if (subcommand !== undefined) {
    return subcommand(cli, rest);
  }
  const options: CliOptions = parseArguments(cli.arguments_);
  if (printedInformation(options, cli)) {
    return 0;
  }
  return runConfigured(
    options.json
      ? { ...cli, options, stdout: cli.stderr, jsonOutput: cli.stdout }
      : { ...cli, options },
  );
}

function runConfigured(cli: ConfiguredCli): ExitCode {
  const { options } = cli;
  const target = resolveRunTarget({ ...cli, missingPathHint });
  const currentProjectRoot = textOf(target.currentProjectRoot);
  const config: NitpickerConfig = loadConfig(currentProjectRoot);
  writePresetHint(cli.stderr, config, currentProjectRoot);
  const headPolicy: unknown = resolveProjectHeadPolicy(config, currentProjectRoot, {
    maven: cli.environment['NITPICKER_MAVEN'],
  });
  const presetSet = presetAnalyzers(config, options.all ? cli.snapshotAnalyzers : cli.analyzers);
  const profiled = applyRunProfile(configureAll(presetSet, config, headPolicy), options);
  const setup: RunSetup = {
    analyzers: profiled.analyzers,
    quick: profiled.quick,
    captureHead: stagedCapture(cli, currentProjectRoot),
    setupErrors: emptySourcesErrors(config, currentProjectRoot, { headPolicy, ...options }),
  };
  writeNotes(cli.stderr, describeDisableCascade(presetSet, config));
  const selected = selectAnalyzers(setup.analyzers, options.analyzerNames);
  assertProjectPeers({
    projectRoot: currentProjectRoot,
    analyzers: selected,
    configuredRunner: config.tools?.tests?.runner,
  });
  const run = { currentProjectRoot, config, headPolicy, scope: target.scope, setup };
  const exitCode: unknown = withRunLock(
    { projectRoot: currentProjectRoot, stderr: cli.stderr },
    () => (options.all ? runSnapshot(cli, run) : runComparison(cli, run)),
  );
  return numberOr(exitCode, 2);
}

function runSnapshot(cli: ConfiguredCli, run: ConfiguredRun): unknown {
  const { config, currentProjectRoot, headPolicy } = run;
  writeNotes(cli.stderr, historyAvailabilityNotes(config, headPolicy, currentProjectRoot));
  const snapshotHeadPolicy: unknown = snapshotPolicy({
    config,
    currentProjectRoot,
    headPolicy,
    stdout: cli.stdout,
  });
  return runSnapshotCli({
    options: cli.options,
    currentProjectRoot,
    ...run.setup,
    headPolicy: snapshotHeadPolicy,
    stdout: cli.stdout,
    jsonOutput: cli.jsonOutput,
    stderr: cli.stderr,
    environment: cli.environment,
    runTasks: cli.runTasks,
    scope: run.scope,
  });
}

function runComparison(cli: ConfiguredCli, run: ConfiguredRun): unknown {
  return runComparisonCli({
    ...cli,
    currentProjectRoot: run.currentProjectRoot,
    ...run.setup,
    injectedAnalyzers: cli.analyzers,
    config: run.config,
    headPolicy: run.headPolicy,
    scope: run.scope,
  });
}

function runComparisonCli(cli: ComparisonCli): unknown {
  const { options, currentProjectRoot, config } = cli;
  const repositoryRoot = realpathSync(
    runGit(currentProjectRoot, ['rev-parse', '--show-toplevel']).trim(),
  );
  const base = resolveBase({
    repositoryRoot,
    explicitBase: options.baseRef,
    configuredBase: config.base,
    environment: cli.environment,
    staged: options.staged,
  });
  const outputRoot = outputRootFor(currentProjectRoot, options.outputRoot, 'diff');
  const selection = selectComparisonAnalyzers(cli);
  const { analyzers } = selection;
  clearDiffReports(outputRoot);
  const headPolicy: unknown = comparisonPolicy({ ...cli, repositoryRoot, base }, resolveComparison);
  const fixResult: unknown = fixIfRequested(
    { ...cli, headPolicy, spawnEnvironment: { ...process.env, ...cli.environment } },
    repositoryRoot,
    base,
  );
  const cacheStore = resolveRunCacheStore(cli);
  const requestedBaseRef: unknown = base.baseRef;
  const report = runQualityDiff({
    repositoryRoot,
    projectRelativePath: path.relative(repositoryRoot, currentProjectRoot) || '.',
    headProjectRoot: currentProjectRoot,
    requestedBaseRef,
    outputRoot,
    analyzers,
    ...selection.runFields,
    cacheStore,
    includeWorkingTree: true,
    captureHead: cli.captureHead,
    quick: cli.quick,
    staged: options.staged,
    additionalToolErrors: [...listOf(fieldOf(fixResult, 'toolErrors')), ...cli.setupErrors],
    configOverrides: describeConfigOverrides(config),
    headPolicy,
    resolveBaseSetup: baseSetupResolver(cli, config, headPolicy),
    describeNotices: noticeDescriber(config, headPolicy, currentProjectRoot),
    ...acceptanceOf(cli),
    scope: cli.scope,
    progress: cli.progress,
    runTasks: cli.runTasks,
    warn: (message: string) => cli.stderr.write(`nitpicker: ${message}\n`),
  });
  return writeComparisonOutcome({ cli, report, base, outputRoot });
}

const invokedPath = process.argv[1];

if (invokedPath !== undefined && realpathSync(invokedPath) === import.meta.filename) {
  process.exitCode = await runCli();
}
