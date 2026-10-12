#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import path from 'node:path';
import { PACKAGE_ROOT, resolveProjectRoot } from './tooling/tool-resolution.mjs';
import {
  prepareSnapshotDependencies,
  removeSnapshotDependencies,
} from '../languages/typescript/adapters/static-checks-runner.mjs';
import { resolveHeadPolicy } from '../languages/typescript/preset/head-policy.mjs';
import { createBaseSetupResolver } from './base-setup.mjs';
import { configureAnalyzers } from './configure-analyzers.mjs';
import { presetAnalyzers } from './preset-analyzers.mjs';
import { describeConfigOverrides, loadConfig } from './config.mjs';
import {
  clearSnapshotReports,
  renderRuleFilterSection as renderSnapshotRuleFilterSection,
  writeSnapshotReports,
} from './snapshot/reporters.mjs';
import { runQualitySnapshot } from './snapshot/run-snapshot.mjs';
import { parseDrillDownOptions } from './diff/cli.mjs';
import { fixWorkingTree } from './fix/run-fix.mjs';
import { resolveBase } from './diff/base-ref.mjs';
import { captureWorkingTree, runGit } from './diff/git.mjs';
import { withTemporaryWorktree } from './diff/worktree.mjs';
import {
  absoluteTextReportPath,
  clearDiffReports,
  renderConsoleSummary,
  renderRuleFilterSection,
} from './diff/reporters.mjs';
import { withRunLock } from './run-lock.mjs';
import { createLayeredStore, resolveCacheStore } from './diff/cache-stores.mjs';
import { publishBaseSnapshot } from './diff/publish-cache.mjs';
import { runQualityDiff } from './diff/run-diff.mjs';
import { reportingProgress } from './diff/progress.mjs';
import { runScheduler, selectAnalyzers } from './diff/run-analyzers.mjs';
import { selectAnalyzerShard } from './diff/sharding.mjs';
import { runAggregateCli } from './diff/aggregate-shards.mjs';

export function runCli(options = {}) {
  const cli = withCliDefaults(options);
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
    cli.stderr.write(
      `nitpicker failed: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    return 2;
  }
}

function withCliDefaults(options) {
  const stderr = options.stderr ?? process.stderr;
  const progress = options.progress ?? stderr;
  return {
    ...options,
    arguments_: options.arguments_ ?? process.argv.slice(2),
    environment: options.environment ?? process.env,
    snapshotAnalyzers: options.snapshotAnalyzers ?? options.analyzers,
    stdout: options.stdout ?? process.stdout,
    stderr,
    progress,
    runTasks: reportingProgress(options.runTasks ?? runScheduler, progress),
  };
}

const USAGE_TEXT =
  'Usage: nitpicker [--base <ref>] [--output <dir>] [--all | --fix]' +
  ' [--analyzer <name>]... [--rule <substring>]...' +
  ' [--shard-count <n> --shard-index <i>] [--defer-exit] [--no-cache] [--help]\n' +
  '       nitpicker aggregate --input-root <directory> --shard-count <count>' +
  ' [--output <directory>] [--policy-root <directory>]\n' +
  '       nitpicker cache publish [--analyzer <name>]... [--shard-count <n> --shard-index <i>]\n';

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
  const headPolicy = resolveHeadPolicy(config, currentProjectRoot);
  const analyzers = configureAnalyzers(
    presetAnalyzers(config, options.all ? cli.snapshotAnalyzers : cli.analyzers),
    config,
    headPolicy,
  );
  return withRunLock({ projectRoot: currentProjectRoot, stderr: cli.stderr }, () => {
    if (options.all) {
      return runSnapshotCli({
        options,
        currentProjectRoot,
        analyzers,
        headPolicy,
        stdout,
        runTasks,
      });
    }
    return runComparisonCli({
      ...cli,
      currentProjectRoot,
      analyzers,
      resolveBaseSetup: createBaseSetupResolver({
        headConfig: config,
        injectedAnalyzers: cli.analyzers,
        warn: (message) => cli.stderr.write(`nitpicker: ${message}\n`),
      }),
      config,
      headPolicy,
    });
  });
}

function runCacheCommand({
  arguments_,
  environment,
  currentProjectRoot,
  analyzers,
  stdout,
  stderr,
  runTasks,
}) {
  const { analyzerNames, shardCount, shardIndex, remainingArguments } =
    parseDrillDownOptions(arguments_);
  if (remainingArguments.length !== 1 || remainingArguments[0] !== 'publish') {
    throw new Error(
      remainingArguments.length === 0 || remainingArguments[0] === 'publish'
        ? 'Usage: nitpicker cache publish'
        : `Unknown cache command: ${remainingArguments.join(' ')}`,
    );
  }
  const projectRoot =
    currentProjectRoot === undefined ? resolveProjectRoot() : realpathSync(currentProjectRoot);
  const config = loadConfig(projectRoot);
  const headPolicy = resolveHeadPolicy(config, projectRoot);
  const configured = configureAnalyzers(presetAnalyzers(config, analyzers), config, headPolicy);
  const selected =
    shardCount === undefined
      ? selectAnalyzers(configured, analyzerNames)
      : selectAnalyzerShard(configured, shardCount, shardIndex);
  if (selected.length === 0) {
    throw new Error('No quality analyzers are configured.');
  }
  const { remote, warnings } = resolveCacheStore({ projectRoot, environment });
  for (const warning of warnings) {
    stderr.write(`nitpicker: ${warning}\n`);
  }
  if (remote === undefined) {
    throw new Error('nitpicker cache publish requires NITPICKER_CACHE_URL');
  }
  const repositoryRoot = realpathSync(runGit(projectRoot, ['rev-parse', '--show-toplevel']).trim());
  const result = publishBaseSnapshot({
    repositoryRoot,
    projectRelativePath: path.relative(repositoryRoot, projectRoot) || '.',
    liveProjectRoot: projectRoot,
    analyzers: selected,
    store: createLayeredStore({ remote, writeRemote: true }),
    configOverrides: describeConfigOverrides(config),
    headPolicy,
    runTasks,
  });
  stdout.write(
    `Published ${String(result.published.length)} of ${String(selected.length)} base snapshots` +
      ` for ${result.commitSha}${result.published.length === 0 ? '' : `: ${result.published.join(', ')}`}\n`,
  );
  for (const skipped of result.skipped) {
    stdout.write(`Not published: ${skipped}\n`);
  }
  return result.skipped.length === 0 ? 0 : 2;
}

function parseArguments(arguments_) {
  const { analyzerNames, ruleFilters, shardCount, shardIndex, deferExit, remainingArguments } =
    parseDrillDownOptions(arguments_);
  let all = false;
  let fix = false;
  let baseRef;
  let outputRoot;
  let help = false;
  let cache = true;

  for (let index = 0; index < remainingArguments.length; index += 1) {
    const argument = remainingArguments[index];
    if (argument === '--all') {
      all = true;
      continue;
    }
    if (argument === '--fix') {
      fix = true;
      continue;
    }
    if (argument === '--no-cache') {
      cache = false;
      continue;
    }
    if (argument === '--help') {
      help = true;
      continue;
    }
    if (argument === '--base' || argument === '--output') {
      const value = remainingArguments[index + 1];
      if (value === undefined || value.startsWith('--')) {
        throw new Error(`${argument} requires a value`);
      }
      if (argument === '--base') {
        baseRef = value;
      } else {
        outputRoot = value;
      }
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }

  if (all && fix) {
    throw new Error('--fix cannot be combined with --all');
  }
  if (all && baseRef !== undefined) {
    throw new Error('--all cannot be combined with --base');
  }
  if (all && (shardCount !== undefined || shardIndex !== undefined)) {
    throw new Error('--all cannot be combined with --shard-count or --shard-index');
  }
  if (all && deferExit) {
    throw new Error('--all cannot be combined with --defer-exit');
  }

  return {
    all,
    fix,
    baseRef,
    outputRoot,
    analyzerNames,
    ruleFilters,
    shardCount,
    shardIndex,
    deferExit,
    cache,
    help,
  };
}

function runComparisonCli(cli) {
  const { options, currentProjectRoot, config, headPolicy } = cli;
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
  const fixResult = fixIfRequested(cli, repositoryRoot, base);
  clearDiffReports(outputRoot);
  const cacheStore = resolveRunCacheStore(cli);
  const report = runQualityDiff({
    repositoryRoot,
    projectRelativePath: path.relative(repositoryRoot, currentProjectRoot) || '.',
    headProjectRoot: currentProjectRoot,
    requestedBaseRef: base.baseRef,
    outputRoot,
    analyzers: selectComparisonAnalyzers(cli),
    cacheStore,
    includeWorkingTree: true,
    additionalToolErrors: fixResult.toolErrors,
    configOverrides: describeConfigOverrides(config),
    headPolicy,
    resolveBaseSetup: cli.resolveBaseSetup,
    progress: cli.progress,
    runTasks: cli.runTasks,
  });
  return writeComparisonOutcome({ cli, report, base, outputRoot });
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
  const { options, environment, currentProjectRoot, stdout } = cli;
  stdout.write(`Base: ${base.baseRef} (${base.source})\n`);
  stdout.write(
    renderConsoleSummary(report, {
      color: environment.NO_COLOR === undefined,
      diagnosticsPath: absoluteTextReportPath(outputRoot),
    }),
  );
  stdout.write(renderRuleFilterSection(report, options.ruleFilters));
  if (options.deferExit) {
    return 0;
  }
  if (report.summary.newEnforceableFindings > 0) {
    return 1;
  }
  return report.summary.overallStatus === 'completed' ? 0 : 2;
}

function runSnapshotCli({ options, currentProjectRoot, analyzers, headPolicy, stdout, runTasks }) {
  const outputRoot =
    options.outputRoot === undefined
      ? path.join(currentProjectRoot, 'reports/quality/snapshot')
      : path.resolve(currentProjectRoot, options.outputRoot);
  clearSnapshotReports(outputRoot);
  const selectedAnalyzers = selectAnalyzers(analyzers, options.analyzerNames);
  if (selectedAnalyzers.length === 0) {
    throw new Error('No quality analyzers are configured.');
  }

  const repositoryRoot = realpathSync(
    runGit(currentProjectRoot, ['rev-parse', '--show-toplevel']).trim(),
  );
  const relativeProjectPath = path.relative(repositoryRoot, currentProjectRoot) || '.';
  const headSha = runGit(repositoryRoot, ['rev-parse', 'HEAD^{commit}']).trim();
  const capturedSha = captureWorkingTree(repositoryRoot, headSha);
  const report = withTemporaryWorktree(repositoryRoot, capturedSha, (worktreeRoot) => {
    const snapshotRoot = path.join(worktreeRoot, relativeProjectPath);
    const needsDependencies = selectedAnalyzers.some((analyzer) => analyzer.requiresDependencies);
    const dependencies = needsDependencies
      ? prepareSnapshotDependencies({
          projectRoot: snapshotRoot,
          liveProjectRoot: currentProjectRoot,
          toolRoot: PACKAGE_ROOT,
        })
      : undefined;
    try {
      return runQualitySnapshot({
        analyzers: selectedAnalyzers,
        projectRoot: snapshotRoot,
        policyRoot: snapshotRoot,
        toolRoot: PACKAGE_ROOT,
        liveProjectRoot: currentProjectRoot,
        headPolicy,
        runTasks,
      });
    } finally {
      removeSnapshotDependencies(dependencies);
    }
  });
  report.text = writeSnapshotReports(outputRoot, report);
  stdout.write(report.text);
  stdout.write(renderSnapshotRuleFilterSection(report, options.ruleFilters));
  if (report.summary.enforceableFindings > 0) {
    return 1;
  }
  return report.summary.overallStatus === 'tool-error' ? 2 : 0;
}

const invokedPath = process.argv[1];
if (invokedPath !== undefined && realpathSync(invokedPath) === import.meta.filename) {
  process.exitCode = runCli();
}
