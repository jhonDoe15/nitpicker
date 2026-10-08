import path from 'node:path';
import { realpathSync } from 'node:fs';
import { resolveProjectRoot } from '../../adapters/tool-resolution.mjs';
import { pathToFileURL } from 'node:url';
import { configuredAnalyzers } from '../../preset/diff/configured-analyzers.mjs';
import { runGit } from './git.mjs';
import {
  clearDiffReports,
  relativeTextReportPath,
  renderConsoleSummary,
  renderRuleFilterSection,
} from './reporters.mjs';
import { selectAnalyzers } from './run-analyzers.mjs';
import { runQualityDiff } from './run-diff.mjs';
import { selectAnalyzerShard } from './sharding.mjs';

export function resolveBaseRef(arguments_, environment) {
  let baseRef;
  let outputRoot;

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === '--base' || argument === '--output') {
      const value = arguments_[index + 1];
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
    if (argument === '--help') {
      return { kind: 'help' };
    }
    throw new Error(`Unknown argument: ${argument}`);
  }

  const ciTarget = [
    environment.CHANGE_TARGET,
    environment.GITHUB_BASE_REF,
    environment.CI_MERGE_REQUEST_TARGET_BRANCH_NAME,
  ].find((target) => target !== undefined && target.length > 0);
  if (baseRef === undefined && ciTarget !== undefined) {
    baseRef = ciTarget.startsWith('origin/') ? ciTarget : `origin/${ciTarget}`;
  }
  if (baseRef === undefined) {
    throw new Error('A base ref is required. Use --base <ref>, for example --base origin/master.');
  }

  return { kind: 'run', baseRef, outputRoot };
}

/**
 * Extracts the repeatable drill-down flags before the remaining arguments reach
 * `resolveBaseRef`, so that function's contract (and its direct unit tests) stay untouched by
 * flags it does not need to know about.
 */
export function parseDrillDownOptions(arguments_) {
  const analyzerNames = [];
  const ruleFilters = [];
  const remainingArguments = [];
  let deferExit = false;
  let shardCount;
  let shardIndex;
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (
      argument === '--analyzer' ||
      argument === '--rule' ||
      argument === '--shard-count' ||
      argument === '--shard-index'
    ) {
      const value = arguments_[index + 1];
      if (value === undefined || value.startsWith('--')) {
        throw new Error(`${argument} requires a value`);
      }
      if (argument === '--analyzer') {
        analyzerNames.push(value);
      } else if (argument === '--rule') {
        ruleFilters.push(value);
      } else if (argument === '--shard-count') {
        shardCount = Number(value);
      } else {
        shardIndex = Number(value);
      }
      index += 1;
      continue;
    }
    if (argument === '--defer-exit') {
      deferExit = true;
      continue;
    }
    remainingArguments.push(argument);
  }
  if ((shardCount === undefined) !== (shardIndex === undefined)) {
    throw new Error('--shard-count and --shard-index must be provided together');
  }
  if (shardCount !== undefined && analyzerNames.length > 0) {
    throw new Error('--analyzer cannot be combined with --shard-count');
  }
  return {
    analyzerNames,
    ruleFilters,
    shardCount,
    shardIndex,
    deferExit,
    remainingArguments,
  };
}

export function runCli({
  arguments_ = process.argv.slice(2),
  environment = process.env,
  currentProjectRoot,
  analyzers = configuredAnalyzers,
  stdout = process.stdout,
  stderr = process.stderr,
} = {}) {
  try {
    const { analyzerNames, ruleFilters, shardCount, shardIndex, deferExit, remainingArguments } =
      parseDrillDownOptions(arguments_);
    const options = resolveBaseRef(remainingArguments, environment);
    if (options.kind === 'help') {
      stdout.write(
        'Usage: nitpicker changes --base <ref> [--output <directory>]' +
          ' [--analyzer <name>]... [--rule <substring>]...' +
          ' [--shard-count <count> --shard-index <index> --defer-exit]\n',
      );
      return 0;
    }
    currentProjectRoot =
      currentProjectRoot === undefined ? resolveProjectRoot() : realpathSync(currentProjectRoot);
    const outputRoot =
      options.outputRoot === undefined
        ? path.join(currentProjectRoot, 'reports/quality/diff')
        : path.resolve(currentProjectRoot, options.outputRoot);
    clearDiffReports(outputRoot);
    const selectedAnalyzers =
      shardCount === undefined
        ? selectAnalyzers(analyzers, analyzerNames)
        : selectAnalyzerShard(analyzers, shardCount, shardIndex);
    if (selectedAnalyzers.length === 0) {
      throw new Error(
        'No quality analyzers are configured. The comparison framework is ready, but real analyzer adapters are a later phase.',
      );
    }

    const repositoryRoot = realpathSync(
      runGit(currentProjectRoot, ['rev-parse', '--show-toplevel']).trim(),
    );
    const projectRelativePath = path.relative(repositoryRoot, currentProjectRoot) || '.';
    const report = runQualityDiff({
      repositoryRoot,
      projectRelativePath,
      headProjectRoot: currentProjectRoot,
      requestedBaseRef: options.baseRef,
      outputRoot,
      analyzers: selectedAnalyzers,
    });
    stdout.write(
      renderConsoleSummary(report, {
        color: environment.NO_COLOR === undefined,
        diagnosticsPath: relativeTextReportPath(currentProjectRoot, outputRoot),
      }),
    );
    stdout.write(renderRuleFilterSection(report, ruleFilters));
    if (deferExit) {
      return 0;
    }
    if (report.summary.overallStatus !== 'completed') {
      return 2;
    }
    return report.summary.newEnforceableFindings > 0 ? 1 : 0;
  } catch (error) {
    stderr.write(
      `nitpicker changes failed: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    return 2;
  }
}

const invokedPath = process.argv[1];
if (
  invokedPath !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(invokedPath)).href
) {
  process.exitCode = runCli();
}
