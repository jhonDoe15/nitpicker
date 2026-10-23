#!/usr/bin/env node
import { runAggregateCli } from './diff/sharding/aggregate-shards.mjs';
import { reportingProgress } from './diff/execution/progress.mjs';
import { runScheduler, selectAnalyzers } from './diff/execution/run-analyzers.mjs';
import { runCacheCommand } from './command/cache.mjs';
import { runChangelogCommand } from './command/changelog.mjs';
import { parseArguments, USAGE_TEXT } from './command/arguments.mjs';
import { resolveProjectRoot } from './tooling/tool-resolution.mjs';
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
import { baseSetupResolver } from './command/policy-review/base-setup.mjs';
import { historyAvailabilityNotes, noticeDescriber } from './command/policy-review/notices.mjs';
import { policyAcceptance } from './command/policy-review/policy-acceptance.mjs';
import { comparisonPolicy, snapshotPolicy } from './conventions/resolve.mjs';
import { runGit } from './diff/git/repository/command.mjs';
import { resolveComparison } from './diff/git/repository/git.mjs';
import { resolveBase } from './diff/git/repository/base-ref.mjs';
import path from 'node:path';
import { clearDiffReports, absoluteTextReportPath } from './diff/reporting/reporters.mjs';
import { runQualityDiff } from './diff/comparison/run-diff.mjs';
import { fixWorkingTree } from './fix/run-fix.mjs';
import { resolveCacheStore } from './diff/cache/cache-stores.mjs';
import { selectAnalyzerShard } from './diff/sharding/sharding.mjs';
import { renderConsoleSummary } from './diff/reporting/summary.mjs';
import { renderClosingSections } from './exceptions/stale-exceptions.mjs';
import { runHistoryCli } from '../shared/history/runner.mjs';
import { runHygieneCli } from '../shared/hygiene/runner.mjs';
import {
  TROUBLESHOOTING_ANCHORS,
  withTroubleshooting,
} from '../shared/messages/troubleshooting.mjs';

const CHECK_COMMANDS = { hygiene: runHygieneCli, history: runHistoryCli };

export function runCli(options = {}) {
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
    return runCommand(cli);
  } catch (error) {
    cli.stderr.write(`nitpicker failed: ${failureText(error)}\n`);
    return 2;
  }
}

function failureText(error) {
  const message = error instanceof Error ? error.message : String(error);
  return withTroubleshooting(message, TROUBLESHOOTING_ANCHORS.exitCode2);
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
  if (cli.arguments_[0] === 'cache') {
    return runCacheCommand({
      arguments_: cli.arguments_.slice(1),
      environment: cli.environment,
      currentProjectRoot: cli.currentProjectRoot,
      analyzers: cli.analyzers,
      stdout: cli.stdout,
      stderr: cli.stderr,
      runTasks: cli.runTasks,
    });
  }
  if (cli.arguments_[0] === 'changelog') {
    return runChangelogCommand({
      arguments_: cli.arguments_.slice(1),
      stdout: cli.stdout,
      stderr: cli.stderr,
    });
  }
  const options = parseArguments(cli.arguments_);
  if (options.help) {
    cli.stdout.write(USAGE_TEXT);
    return 0;
  }
  return runConfigured({ ...cli, options });
}

function runConfigured(cli) {
  const { options, stdout, runTasks } = cli;
  const currentProjectRoot =
    cli.currentProjectRoot === undefined
      ? resolveProjectRoot()
      : realpathSync(cli.currentProjectRoot);
  const config = loadConfig(currentProjectRoot);
  const headPolicy = resolveProjectHeadPolicy(config, currentProjectRoot);
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
        runTasks,
      });
    }
    return runComparisonCli({
      ...cli,
      currentProjectRoot,
      analyzers,
      injectedAnalyzers: cli.analyzers,
      config,
      headPolicy,
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
  const outputRoot =
    options.outputRoot === undefined
      ? path.join(currentProjectRoot, 'reports/quality/diff')
      : path.resolve(currentProjectRoot, options.outputRoot);
  clearDiffReports(outputRoot);
  const analyzers = selectComparisonAnalyzers(cli);
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
    cacheStore,
    includeWorkingTree: true,
    additionalToolErrors: fixResult.toolErrors,
    configOverrides: describeConfigOverrides(config),
    headPolicy,
    resolveBaseSetup: baseSetupResolver(cli, config, headPolicy),
    describeNotices: noticeDescriber(config, headPolicy, currentProjectRoot),
    ...acceptanceOf(cli),
    progress: cli.progress,
    runTasks: cli.runTasks,
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

function selectComparisonAnalyzers({ options, analyzers }) {
  const selectedAnalyzers =
    options.shardCount === undefined
      ? selectAnalyzers(analyzers, options.analyzerNames)
      : selectAnalyzerShard(analyzers, options.shardCount, options.shardIndex);
  if (selectedAnalyzers.length === 0) {
    throw new Error(
      'No quality analyzers are configured. The comparison framework is ready, but real analyzer adapters are a later phase.',
    );
  }
  return selectedAnalyzers;
}

function writeComparisonOutcome({ cli, report, base, outputRoot }) {
  const { options, environment, stdout } = cli;
  stdout.write(`Base: ${base.baseRef} (${base.source})\n`);
  stdout.write(
    renderConsoleSummary(report, {
      color: environment.NO_COLOR === undefined,
      diagnosticsPath: absoluteTextReportPath(outputRoot),
    }),
  );
  stdout.write(renderClosingSections(cli, report));
  if (options.deferExit) {
    return 0;
  }
  if (report.summary.newEnforceableFindings > 0) {
    return 1;
  }
  return report.summary.overallStatus === 'completed' ? 0 : 2;
}

const invokedPath = process.argv[1];

if (invokedPath !== undefined && realpathSync(invokedPath) === import.meta.filename) {
  process.exitCode = runCli();
}
