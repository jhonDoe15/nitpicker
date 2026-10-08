#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import path from 'node:path';
import { PACKAGE_ROOT, resolveProjectRoot } from '../adapters/tool-resolution.mjs';
import {
  prepareSnapshotDependencies,
  removeSnapshotDependencies,
} from '../adapters/diff/static-checks-runner.mjs';
import { configuredAnalyzers } from '../preset/diff/configured-analyzers.mjs';
import { resolveHeadPolicy } from '../preset/head-policy.mjs';
import { configureAnalyzers } from './configure-analyzers.mjs';
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
  clearDiffReports,
  relativeTextReportPath,
  renderConsoleSummary,
  renderRuleFilterSection,
} from './diff/reporters.mjs';
import { createLayeredStore, resolveCacheStore } from './diff/cache-stores.mjs';
import { publishBaseSnapshot } from './diff/publish-cache.mjs';
import { runQualityDiff } from './diff/run-diff.mjs';
import { selectAnalyzers } from './diff/run-analyzers.mjs';
import { selectAnalyzerShard } from './diff/sharding.mjs';
import { runAggregateCli } from './diff/aggregate-shards.mjs';

export function runCli({
  arguments_ = process.argv.slice(2),
  environment = process.env,
  currentProjectRoot,
  analyzers = configuredAnalyzers,
  snapshotAnalyzers = analyzers,
  stdout = process.stdout,
  stderr = process.stderr,
  executeFixCommand,
} = {}) {
  if (arguments_[0] === 'aggregate') {
    return runAggregateCli({
      arguments_: arguments_.slice(1),
      currentProjectRoot,
      analyzers,
      stdout,
      stderr,
      environment,
    });
  }
  try {
    if (arguments_[0] === 'cache') {
      return runCacheCommand({
        arguments_: arguments_.slice(1),
        environment,
        currentProjectRoot,
        analyzers,
        stdout,
        stderr,
      });
    }
    const options = parseArguments(arguments_);
    if (options.help) {
      stdout.write(
        'Usage: nitpicker [--base <ref>] [--output <dir>] [--all | --fix]' +
          ' [--analyzer <name>]... [--rule <substring>]...' +
          ' [--shard-count <n> --shard-index <i>] [--defer-exit] [--no-cache] [--help]\n' +
          '       nitpicker aggregate --input-root <directory> --shard-count <count>' +
          ' [--output <directory>] [--policy-root <directory>]\n' +
          '       nitpicker cache publish [--analyzer <name>]... [--shard-count <n> --shard-index <i>]\n',
      );
      return 0;
    }

    const selectedProjectRoot =
      currentProjectRoot === undefined ? resolveProjectRoot() : realpathSync(currentProjectRoot);
    // The config is read from the head checkout and applies to both sides of the comparison.
    const config = loadConfig(selectedProjectRoot);
    const headPolicy = resolveHeadPolicy(config);
    const configure = (list) => configureAnalyzers(list, config, headPolicy);
    if (options.all) {
      return runSnapshotCli({
        options,
        currentProjectRoot: selectedProjectRoot,
        analyzers: configure(snapshotAnalyzers),
        headPolicy,
        stdout,
      });
    }
    return runComparisonCli({
      options,
      environment,
      currentProjectRoot: selectedProjectRoot,
      analyzers: configure(analyzers),
      config,
      headPolicy,
      stdout,
      stderr,
      executeFixCommand,
    });
  } catch (error) {
    stderr.write(`nitpicker failed: ${error instanceof Error ? error.message : String(error)}\n`);
    return 2;
  }
}

/** `nitpicker cache publish`: analyze the checked-out commit and upload its findings as a base snapshot. */
function runCacheCommand({
  arguments_,
  environment,
  currentProjectRoot,
  analyzers,
  stdout,
  stderr,
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
  const headPolicy = resolveHeadPolicy(config);
  const configured = configureAnalyzers(analyzers, config, headPolicy);
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
    // Publishing succeeds only when the remote accepted the entry, so it skips the local store.
    store: createLayeredStore({ remote, writeRemote: true }),
    configOverrides: describeConfigOverrides(config),
    headPolicy,
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

function runComparisonCli({
  options,
  environment,
  currentProjectRoot,
  analyzers,
  config,
  headPolicy,
  stdout,
  stderr,
  executeFixCommand,
}) {
  const repositoryRoot = realpathSync(
    runGit(currentProjectRoot, ['rev-parse', '--show-toplevel']).trim(),
  );
  const projectRelativePath = path.relative(repositoryRoot, currentProjectRoot) || '.';
  const base = resolveBase({
    repositoryRoot,
    explicitBase: options.baseRef,
    configuredBase: config.base,
    environment,
  });
  const outputRoot =
    options.outputRoot === undefined
      ? path.join(currentProjectRoot, 'reports/quality/diff')
      : path.resolve(currentProjectRoot, options.outputRoot);
  const fixResult = options.fix
    ? fixWorkingTree({
        repositoryRoot,
        projectRoot: currentProjectRoot,
        baseRef: base.baseRef,
        executeFixCommand,
        headPolicy,
      })
    : { fixedFiles: [], toolErrors: [] };
  if (options.fix) {
    stdout.write(
      `Fixed files:\n${fixResult.fixedFiles.length === 0 ? '(none)\n' : `${fixResult.fixedFiles.join('\n')}\n`}`,
    );
  }
  clearDiffReports(outputRoot);
  const { store: cacheStore, warnings } = resolveCacheStore({
    projectRoot: currentProjectRoot,
    environment,
  });
  if (options.cache) {
    for (const warning of warnings) {
      stderr.write(`nitpicker: ${warning}\n`);
    }
  }
  const selectedAnalyzers =
    options.shardCount === undefined
      ? selectAnalyzers(analyzers, options.analyzerNames)
      : selectAnalyzerShard(analyzers, options.shardCount, options.shardIndex);
  if (selectedAnalyzers.length === 0) {
    throw new Error(
      'No quality analyzers are configured. The comparison framework is ready, but real analyzer adapters are a later phase.',
    );
  }

  const report = runQualityDiff({
    repositoryRoot,
    projectRelativePath,
    headProjectRoot: currentProjectRoot,
    requestedBaseRef: base.baseRef,
    outputRoot,
    analyzers: selectedAnalyzers,
    cacheStore: options.cache ? cacheStore : undefined,
    includeWorkingTree: true,
    additionalToolErrors: fixResult.toolErrors,
    configOverrides: describeConfigOverrides(config),
    headPolicy,
  });
  stdout.write(`Base: ${base.baseRef} (${base.source})\n`);
  stdout.write(
    renderConsoleSummary(report, {
      color: environment.NO_COLOR === undefined,
      diagnosticsPath: relativeTextReportPath(currentProjectRoot, outputRoot),
    }),
  );
  stdout.write(renderRuleFilterSection(report, options.ruleFilters));
  if (options.deferExit) {
    return 0;
  }
  if (report.summary.overallStatus !== 'completed') {
    return 2;
  }
  return report.summary.newEnforceableFindings > 0 ? 1 : 0;
}

function runSnapshotCli({ options, currentProjectRoot, analyzers, headPolicy, stdout }) {
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
      });
    } finally {
      removeSnapshotDependencies(dependencies);
    }
  });
  report.text = writeSnapshotReports(outputRoot, report);
  stdout.write(report.text);
  stdout.write(renderSnapshotRuleFilterSection(report, options.ruleFilters));
  if (report.summary.overallStatus === 'tool-error') {
    return 2;
  }
  return report.summary.overallStatus === 'violations' ? 1 : 0;
}

const invokedPath = process.argv[1];
if (invokedPath !== undefined && realpathSync(invokedPath) === import.meta.filename) {
  process.exitCode = runCli();
}
