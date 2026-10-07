#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import path from 'node:path';
import { snapshotAnalyzers as configuredSnapshotAnalyzers } from '../preset/snapshot/configured-analyzers.mjs';
import { configuredAnalyzers } from '../preset/diff/configured-analyzers.mjs';
import {
  clearSnapshotReports,
  renderRuleFilterSection as renderSnapshotRuleFilterSection,
  writeSnapshotReports,
} from './snapshot/reporters.mjs';
import { runQualitySnapshot } from './snapshot/run-snapshot.mjs';
import { parseDrillDownOptions } from './diff/cli.mjs';
import { resolveBase } from './diff/base-ref.mjs';
import { runGit } from './diff/git.mjs';
import {
  clearDiffReports,
  relativeTextReportPath,
  renderConsoleSummary,
  renderRuleFilterSection,
} from './diff/reporters.mjs';
import { runQualityDiff } from './diff/run-diff.mjs';
import { selectAnalyzers } from './diff/run-analyzers.mjs';
import { selectAnalyzerShard } from './diff/sharding.mjs';

const projectRoot = path.resolve(import.meta.dirname, '..');

export function runCli({
  arguments_ = process.argv.slice(2),
  environment = process.env,
  currentProjectRoot = projectRoot,
  analyzers = configuredAnalyzers,
  snapshotAnalyzers = configuredSnapshotAnalyzers,
  stdout = process.stdout,
  stderr = process.stderr,
} = {}) {
  try {
    const options = parseArguments(arguments_);
    if (options.help) {
      stdout.write(
        'Usage: nitpicker [--base <ref>] [--output <dir>] [--all]' +
          ' [--analyzer <name>]... [--rule <substring>]...' +
          ' [--shard-count <n> --shard-index <i>] [--defer-exit] [--help]\n',
      );
      return 0;
    }

    if (options.all) {
      return runSnapshotCli({
        options,
        currentProjectRoot: realpathSync(currentProjectRoot),
        analyzers: snapshotAnalyzers,
        stdout,
      });
    }
    return runComparisonCli({
      options,
      environment,
      currentProjectRoot: realpathSync(currentProjectRoot),
      analyzers,
      stdout,
    });
  } catch (error) {
    stderr.write(`nitpicker failed: ${error instanceof Error ? error.message : String(error)}\n`);
    return 2;
  }
}

function parseArguments(arguments_) {
  const { analyzerNames, ruleFilters, shardCount, shardIndex, deferExit, remainingArguments } =
    parseDrillDownOptions(arguments_);
  let all = false;
  let baseRef;
  let outputRoot;
  let help = false;

  for (let index = 0; index < remainingArguments.length; index += 1) {
    const argument = remainingArguments[index];
    if (argument === '--all') {
      all = true;
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
    baseRef,
    outputRoot,
    analyzerNames,
    ruleFilters,
    shardCount,
    shardIndex,
    deferExit,
    help,
  };
}

function runComparisonCli({ options, environment, currentProjectRoot, analyzers, stdout }) {
  const repositoryRoot = realpathSync(
    runGit(currentProjectRoot, ['rev-parse', '--show-toplevel']).trim(),
  );
  const projectRelativePath = path.relative(repositoryRoot, currentProjectRoot) || '.';
  const base = resolveBase({
    repositoryRoot,
    explicitBase: options.baseRef,
    configuredBase: undefined,
    environment,
  });
  const outputRoot =
    options.outputRoot === undefined
      ? path.join(currentProjectRoot, 'reports/quality/diff')
      : path.resolve(currentProjectRoot, options.outputRoot);
  clearDiffReports(outputRoot);
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
    includeWorkingTree: true,
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

function runSnapshotCli({ options, currentProjectRoot, analyzers, stdout }) {
  const outputRoot =
    options.outputRoot === undefined
      ? path.join(currentProjectRoot, 'reports/quality/snapshot')
      : path.resolve(currentProjectRoot, options.outputRoot);
  clearSnapshotReports(outputRoot);
  const selectedAnalyzers = selectAnalyzers(analyzers, options.analyzerNames);
  if (selectedAnalyzers.length === 0) {
    throw new Error('No quality analyzers are configured.');
  }

  const report = runQualitySnapshot({
    analyzers: selectedAnalyzers,
    projectRoot: currentProjectRoot,
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
