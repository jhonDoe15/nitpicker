#!/usr/bin/env node
import { runAggregateCli } from './diff/sharding/aggregate-shards.mjs';
import { reportingProgress } from './diff/execution/progress.mjs';
import { runScheduler } from './diff/execution/run-analyzers.mjs';
import { runCacheCommand } from './command/cache.mjs';
import { runExplainCommand, runRulesCommand } from './command/reference/reference.mjs';
import { runBaseCommand } from './command/base.mjs';
import { missingPathHint, parseArguments } from './command/arguments.mjs';
import { resolveRunTarget } from './scope/run-target.mjs';
import { realpathSync } from 'node:fs';
import {
  describeConfigOverrides,
  describeDisableCascade,
  loadConfig,
} from './configuration/config.mjs';
import { resolveProjectHeadPolicy } from './conventions/project-head-policy.mjs';
import { configureAnalyzers } from './configuration/configure-analyzers.mjs';
import { presetAnalyzers } from './configuration/preset-analyzers.mjs';
import { withRunLock } from './command/run-lock.mjs';
import { runSnapshotCli } from './command/snapshot.mjs';
import { writeComparisonOutcome } from './command/comparison/outcome.mjs';
import { baseSetupResolver } from './command/policy-review/base-setup.mjs';
import { historyAvailabilityNotes, noticeDescriber } from './command/policy-review/notices.mjs';
import { policyAcceptance } from './command/policy-review/policy-acceptance.mjs';
import { comparisonPolicy, snapshotPolicy } from './conventions/resolve.mjs';
import { runGit } from './diff/git/repository/command.mjs';
import { resolveComparison } from './diff/git/repository/git.mjs';
import { resolveBase } from './diff/git/repository/base-ref.mjs';
import { detachLocalGitVariables } from './diff/git/environment/local-variables.mjs';
import path from 'node:path';
import { clearDiffReports, outputRootFor } from './diff/reporting/reporters.mjs';
import { selectComparisonAnalyzers } from './command/comparison/analyzers.mjs';
import { runQualityDiff } from './diff/comparison/run-diff.mjs';
import { fixWorkingTree } from './fix/run-fix.mjs';
import { resolveCacheStore } from './diff/cache/cache-stores.mjs';
import { runHistoryCli } from '../shared/history/runner.mjs';
import { runHygieneCli } from '../shared/hygiene/runner.mjs';
import { printedInformation } from './help/printed-information.mjs';
import { runInitCommand } from './init/run-init.mjs';
import { javascriptPresetHint } from './configuration/project-checks/preset-detection.mjs';
import { GO_ANALYZER_COMMAND, runGoCli } from '../languages/go/adapters/go-runner.mjs';
import { redirectToBundledTypeScriptApi } from '../languages/typescript/typescript-api/api-selection.mjs';
import { describeError } from '../shared/messages/error-chain.mjs';

const CHECK_COMMANDS = {
  hygiene: runHygieneCli,
  history: runHistoryCli,
  [GO_ANALYZER_COMMAND]: runGoCli,
};
const SUBCOMMANDS = {
  cache: (cli, rest) => runCacheCommand({ ...cli, arguments_: rest }),
  init: (cli, rest) => runInitCommand({ ...cli, arguments_: rest }),
  base: (cli, rest) => runBaseCommand({ ...cli, arguments_: rest }),
  explain: (cli, rest) => runExplainCommand({ ...cli, commandArguments: rest }),
  rules: (cli, rest) => runRulesCommand({ ...cli, commandArguments: rest }),
};

export function runCli(options = {}) {
  detachLocalGitVariables(process.env);
  const cli = withCliDefaults(options);
  const checkCommand = CHECK_COMMANDS[cli.arguments_[0]];
  if (checkCommand !== undefined) {
    return checkCommand({
      commandArguments: cli.arguments_.slice(1),
      stdout: cli.stdout,
      stderr: cli.stderr,
      environment: cli.environment,
    });
  }
  if (cli.arguments_[0] === 'aggregate') {
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
    redirectToBundledTypeScriptApi(cli.environment);
    return runCommand(cli);
  } catch (error) {
    const description = describeError(error) || 'unknown error';
    cli.stderr.write(`nitpicker failed: ${description}\n`);
    if (wantsJson(cli.arguments_)) {
      cli.stdout.write(`${JSON.stringify({ status: 'error', exitCode: 2, error: description })}\n`);
    }
    return 2;
  }
}

function wantsJson(commandLine) {
  return !Object.hasOwn(SUBCOMMANDS, commandLine[0]) && commandLine.includes('--json');
}

function isTerminal(stream) {
  return stream.isTTY === true;
}

function withCliDefaults(options) {
  const stderr = options.stderr ?? process.stderr;
  const progress = options.progress ?? stderr;
  return {
    ...options,
    arguments_: options.arguments_ ?? process.argv.slice(2),
    environment: options.environment ?? process.env,
    interactive:
      options.interactive ?? [process.stdin, options.stdout ?? process.stdout].every(isTerminal),
    snapshotAnalyzers: options.snapshotAnalyzers ?? options.analyzers,
    stdout: options.stdout ?? process.stdout,
    stderr,
    progress,
    runTasks: reportingProgress(options.runTasks ?? runScheduler, progress),
  };
}

function runCommand(cli) {
  const [name, ...rest] = cli.arguments_;
  if (Object.hasOwn(SUBCOMMANDS, name)) {
    return SUBCOMMANDS[name](cli, rest);
  }
  const options = parseArguments(cli.arguments_);
  if (printedInformation(options, cli.stdout)) {
    return 0;
  }
  return runConfigured(
    options.json
      ? { ...cli, options, stdout: cli.stderr, jsonOutput: cli.stdout }
      : { ...cli, options },
  );
}

function writePresetHint(stderr, config, projectRoot) {
  const hint = javascriptPresetHint(config, projectRoot);
  if (hint !== undefined) {
    stderr.write(`nitpicker: ${hint}\n`);
  }
}

function runConfigured(cli) {
  const { options, stdout, runTasks } = cli;
  const { currentProjectRoot, scope } = resolveRunTarget({ ...cli, missingPathHint });
  const config = loadConfig(currentProjectRoot);
  writePresetHint(cli.stderr, config, currentProjectRoot);
  const headPolicy = resolveProjectHeadPolicy(config, currentProjectRoot, {
    maven: cli.environment.NITPICKER_MAVEN,
  });
  const presetSet = presetAnalyzers(config, options.all ? cli.snapshotAnalyzers : cli.analyzers);
  const analyzers = configureAnalyzers(presetSet, config, headPolicy);
  for (const note of describeDisableCascade(presetSet, config)) {
    cli.stderr.write(`nitpicker: ${note}\n`);
  }
  return withRunLock({ projectRoot: currentProjectRoot, stderr: cli.stderr }, () => {
    if (options.all) {
      for (const note of historyAvailabilityNotes(config, headPolicy, currentProjectRoot)) {
        cli.stderr.write(`nitpicker: ${note}\n`);
      }
      return runSnapshotCli({
        options,
        currentProjectRoot,
        analyzers,
        headPolicy: snapshotPolicy({ config, currentProjectRoot, headPolicy, stdout }),
        stdout,
        jsonOutput: cli.jsonOutput,
        stderr: cli.stderr,
        environment: cli.environment,
        runTasks,
        scope,
      });
    }
    return runComparisonCli({
      ...cli,
      currentProjectRoot,
      analyzers,
      injectedAnalyzers: cli.analyzers,
      config,
      headPolicy,
      scope,
    });
  });
}

function runComparisonCli(cli) {
  const { options, currentProjectRoot, config } = cli;
  const repositoryRoot = realpathSync(
    runGit(currentProjectRoot, ['rev-parse', '--show-toplevel']).trim(),
  );
  const base = resolveBase({
    repositoryRoot,
    explicitBase: options.baseRef,
    configuredBase: config.base,
    environment: cli.environment,
  });
  const outputRoot = outputRootFor(currentProjectRoot, options.outputRoot, 'diff');
  const { analyzers, partialRun } = selectComparisonAnalyzers(cli);
  clearDiffReports(outputRoot);
  const headPolicy = comparisonPolicy({ ...cli, repositoryRoot, base }, resolveComparison);
  const fixResult = fixIfRequested({ ...cli, headPolicy }, repositoryRoot, base);
  const cacheStore = resolveRunCacheStore(cli);
  const report = runQualityDiff({
    repositoryRoot,
    projectRelativePath: path.relative(repositoryRoot, currentProjectRoot) || '.',
    headProjectRoot: currentProjectRoot,
    requestedBaseRef: base.baseRef,
    outputRoot,
    analyzers,
    partialRun,
    cacheStore,
    includeWorkingTree: true,
    additionalToolErrors: fixResult.toolErrors,
    configOverrides: describeConfigOverrides(config),
    headPolicy,
    resolveBaseSetup: baseSetupResolver(cli, config, headPolicy),
    describeNotices: noticeDescriber(config, headPolicy, currentProjectRoot),
    ...acceptanceOf(cli),
    scope: cli.scope,
    progress: cli.progress,
    runTasks: cli.runTasks,
    warn: (message) => cli.stderr.write(`nitpicker: ${message}\n`),
  });
  return writeComparisonOutcome({ cli, report, base, outputRoot });
}

function acceptanceOf(cli) {
  const { ignoredAcceptance, ...acceptance } = policyAcceptance(
    cli.options,
    cli.environment,
    cli.interactive,
  );
  if (ignoredAcceptance !== undefined) {
    cli.stderr.write(`nitpicker: ${ignoredAcceptance}\n`);
  }
  return acceptance;
}

function fixIfRequested(cli, repositoryRoot, base) {
  if (!cli.options.fix) {
    return { fixedFiles: [], toolErrors: [] };
  }
  const fixResult = fixWorkingTree({
    repositoryRoot,
    projectRoot: cli.currentProjectRoot,
    baseRef: base.baseRef,
    executeFixCommand: cli.executeFixCommand,
    headPolicy: cli.headPolicy,
    scope: cli.scope,
  });
  cli.stdout.write(
    `Fixed files:\n${fixResult.fixedFiles.length === 0 ? '(none)\n' : `${fixResult.fixedFiles.join('\n')}\n`}`,
  );
  return fixResult;
}

function resolveRunCacheStore(cli) {
  const { store, warnings } = resolveCacheStore({
    projectRoot: cli.currentProjectRoot,
    environment: cli.environment,
  });
  if (cli.options.cache) {
    for (const warning of warnings) {
      cli.stderr.write(`nitpicker: ${warning}\n`);
    }
  }
  return cli.options.cache ? store : undefined;
}

const invokedPath = process.argv[1];

if (invokedPath !== undefined && realpathSync(invokedPath) === import.meta.filename) {
  process.exitCode = runCli();
}
