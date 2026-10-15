import { realpathSync } from 'node:fs';
import path from 'node:path';
import { resolveProjectRoot } from '../tooling/tool-resolution.mjs';
import { pathToFileURL } from 'node:url';
import { configuredAnalyzers } from '../../languages/typescript/preset/diff/configured-analyzers.mjs';
import { resolveHeadPolicy } from '../../languages/typescript/preset/head-policy.mjs';
import { configureAnalyzers } from '../configure-analyzers.mjs';
import { presetAnalyzers } from '../preset-analyzers.mjs';
import { describeConfigOverrides, loadConfig } from '../config.mjs';
import {
  absoluteTextReportPath,
  clearDiffReports,
  renderConsoleSummary,
  writeDiffReports,
} from './reporters.mjs';
import { analyzerName, policyHash, sortByToolAndPath } from './report-model.mjs';
import { planAnalyzerShards } from './sharding.mjs';
import { takeOptionValue } from './cli.mjs';
import { runGit } from './git.mjs';
import { readAndValidateShard, readJson } from './shards/read-shard.mjs';
import { withTemporaryWorktree } from './worktree.mjs';

const COMMON_SUMMARY_PROPERTIES = [
  'requestedBaseRef',
  'resolvedBaseSha',
  'mergeBaseSha',
  'headSha',
  'renamedPaths',
];

function resolvePolicyRoot({ policyRoot, optionsPolicyRoot, currentProjectRoot }) {
  if (policyRoot !== undefined) {
    return realpathSync(policyRoot);
  }
  return optionsPolicyRoot === undefined
    ? undefined
    : realpathSync(path.resolve(currentProjectRoot, optionsPolicyRoot));
}

function resolveConfigurationHashes(
  { analyzers, policyRoot, liveProjectRoot, inputRoot },
  analyzerResolutionErrors,
) {
  if (policyRoot !== undefined) {
    resolveAnalyzerConfigurationHashes(analyzers, policyRoot, analyzerResolutionErrors);
  } else if (
    liveProjectRoot !== undefined &&
    analyzers.some((analyzer) => typeof analyzer.resolveConfigurationHash === 'function')
  ) {
    try {
      const headSha = readJson(path.join(inputRoot, '0'), 'summary.json', 0).headSha;
      withHeadProjectRoot(liveProjectRoot, headSha, (headProjectRoot) => {
        resolveAnalyzerConfigurationHashes(analyzers, headProjectRoot, analyzerResolutionErrors);
      });
    } catch (error) {
      for (const [index, analyzer] of analyzers.entries()) {
        if (typeof analyzer.resolveConfigurationHash === 'function') {
          recordAnalyzerResolutionError(analyzer, index, error, analyzerResolutionErrors);
        }
      }
    }
  }
}

export function aggregateShardReports({
  inputRoot,
  outputRoot,
  analyzers = configuredAnalyzers,
  shardCount,
  liveProjectRoot,
  policyRoot,
  configOverrides = [],
}) {
  const plan = planAnalyzerShards(analyzers, shardCount);
  const analyzerResolutionErrors = [];
  resolveAnalyzerVersions(analyzers, liveProjectRoot, analyzerResolutionErrors);

  resolveConfigurationHashes(
    { analyzers, policyRoot, liveProjectRoot, inputRoot },
    analyzerResolutionErrors,
  );
  const shardReports = plan.map((shardAnalyzers, index) =>
    readAndValidateShard(inputRoot, index, shardAnalyzers),
  );
  validateCommonSummaries(shardReports);

  const { newFindings, resolvedFindings, changedMetrics, heldFindings, toolErrors, notes } =
    mergeShardEntries(shardReports, analyzerResolutionErrors);
  const toolsByName = new Map(
    shardReports.flatMap(({ summary }) => summary.tools.map((tool) => [tool.name, tool])),
  );
  const summary = {
    ...commonSummary(shardReports[0].summary),
    policyHash: policyHash(analyzers, configOverrides),
    configOverrides,
    tools: analyzers.map(({ name }) => toolsByName.get(name)),
    exclusions: analyzerExclusions(analyzers),
    elapsedMs: Math.max(...shardReports.map(({ summary: shardSummary }) => shardSummary.elapsedMs)),
    overallStatus:
      toolErrors.length === 0 &&
      shardReports.every(({ summary: shardSummary }) => shardSummary.overallStatus === 'completed')
        ? 'completed'
        : 'tool-error',
    newEnforceableFindings: newFindings.filter(
      ({ classification }) => classification === 'enforceable',
    ).length,
    shards: shardReports.map(({ summary: shardSummary }, index) => ({
      index,
      analyzers: shardSummary.tools.map(({ name }) => name),
      elapsedMs: shardSummary.elapsedMs,
      status: shardSummary.overallStatus,
    })),
  };
  const report = {
    summary,
    newFindings: sortByToolAndPath(newFindings),
    resolvedFindings: sortByToolAndPath(resolvedFindings),
    unchangedFindings: sortByToolAndPath(heldFindings),
    changedMetrics: sortByToolAndPath(changedMetrics),
    toolErrors: sortByToolAndPath(toolErrors),
    notes: sortByToolAndPath(notes),
  };
  report.text = writeDiffReports(outputRoot, report);
  return report;
}

function mergeShardEntries(shardReports, analyzerResolutionErrors) {
  const toolErrors = mergeEntries(shardReports, 'toolErrors');
  for (const error of analyzerResolutionErrors) {
    if (!toolErrors.some(({ tool }) => tool === error.tool)) {
      toolErrors.push(error);
    }
  }
  return {
    newFindings: mergeEntries(shardReports, 'newFindings'),
    resolvedFindings: mergeEntries(shardReports, 'resolvedFindings'),
    changedMetrics: mergeEntries(shardReports, 'changedMetrics'),
    heldFindings: mergeEntries(shardReports, 'heldFindings'),
    toolErrors,
    notes: mergeEntries(shardReports, 'notes'),
  };
}

export function runAggregateCli({
  arguments_ = process.argv.slice(2),
  currentProjectRoot,
  policyRoot,
  analyzers,
  stdout = process.stdout,
  stderr = process.stderr,
  environment = process.env,
} = {}) {
  let outputRoot;
  try {
    const options = parseArguments(arguments_);
    if (options.kind === 'help') {
      stdout.write(
        'Usage: node core/diff/aggregate-shards.mjs --input-root <directory>' +
          ' --shard-count <count> [--output <directory>] [--policy-root <directory>]\n',
      );
      return 0;
    }
    currentProjectRoot =
      currentProjectRoot === undefined ? resolveProjectRoot() : realpathSync(currentProjectRoot);
    outputRoot = path.resolve(
      currentProjectRoot,
      options.outputRoot ?? 'reports/quality/diff/combined',
    );
    clearDiffReports(outputRoot);
    const config = loadConfig(currentProjectRoot);
    const report = aggregateShardReports({
      inputRoot: path.resolve(currentProjectRoot, options.inputRoot),
      outputRoot,
      analyzers: configureAnalyzers(
        presetAnalyzers(config, analyzers),
        config,
        resolveHeadPolicy(config, currentProjectRoot),
      ),
      configOverrides: describeConfigOverrides(config),
      shardCount: options.shardCount,
      liveProjectRoot: currentProjectRoot,
      policyRoot: resolvePolicyRoot({
        policyRoot,
        optionsPolicyRoot: options.policyRoot,
        currentProjectRoot,
      }),
    });
    stdout.write(
      renderConsoleSummary(report, {
        color: environment.NO_COLOR === undefined,
        diagnosticsPath: absoluteTextReportPath(outputRoot),
      }),
    );
    if (report.summary.newEnforceableFindings > 0) {
      return 1;
    }
    return report.summary.overallStatus === 'completed' ? 0 : 2;
  } catch (error) {
    if (outputRoot !== undefined) {
      clearDiffReports(outputRoot);
    }
    stderr.write(
      `Quality shard aggregation failed: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    return 2;
  }
}

function resolveAnalyzerVersions(analyzers, liveProjectRoot, errors) {
  if (liveProjectRoot === undefined) {
    return;
  }
  for (const [index, analyzer] of analyzers.entries()) {
    try {
      if (typeof analyzer?.resolveVersion === 'function') {
        analyzer.version = analyzer.resolveVersion(liveProjectRoot);
      }
    } catch (error) {
      recordAnalyzerResolutionError(analyzer, index, error, errors);
    }
  }
}

function resolveAnalyzerConfigurationHashes(analyzers, configurationRoot, errors) {
  for (const [index, analyzer] of analyzers.entries()) {
    try {
      const resolveConfigurationHash = analyzer?.resolveConfigurationHash;
      if (typeof resolveConfigurationHash === 'function') {
        analyzer.configurationHash = resolveConfigurationHash(configurationRoot);
      }
    } catch (error) {
      recordAnalyzerResolutionError(analyzer, index, error, errors);
    }
  }
}

function recordAnalyzerResolutionError(analyzer, index, error, errors) {
  if (analyzer?.version === 'unresolved') {
    analyzer.version = 'unknown';
  }
  const tool = analyzerName(analyzer, index);
  if (!errors.some((resolutionError) => resolutionError.tool === tool)) {
    errors.push({
      tool,
      snapshot: 'aggregation',
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

function withHeadProjectRoot(liveProjectRoot, headSha, operation) {
  if (typeof headSha !== 'string' || headSha.length === 0) {
    throw new Error('Shard 0 has no headSha for policy resolution');
  }
  const liveRoot = realpathSync(liveProjectRoot);
  const repositoryRoot = realpathSync(runGit(liveRoot, ['rev-parse', '--show-toplevel']).trim());
  const projectRelativePath = path.relative(repositoryRoot, liveRoot);
  if (
    projectRelativePath === '..' ||
    projectRelativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(projectRelativePath)
  ) {
    throw new Error('Live project root is outside its Git repository');
  }
  return withTemporaryWorktree(repositoryRoot, headSha, (headWorktreeRoot) =>
    operation(path.join(headWorktreeRoot, projectRelativePath)),
  );
}

const OPTION_NAMES = ['--input-root', '--output', '--shard-count', '--policy-root'];

function collectOptionValues(arguments_) {
  const values = {};
  const remaining = arguments_.values();
  for (const argument of remaining) {
    if (argument === '--help') {
      return undefined;
    }
    if (!OPTION_NAMES.includes(argument)) {
      throw new Error(`Unknown argument: ${argument}`);
    }
    values[argument] = takeOptionValue(remaining, argument);
  }
  return values;
}

function parseArguments(arguments_) {
  const values = collectOptionValues(arguments_);
  if (values === undefined) {
    return { kind: 'help' };
  }
  if (values['--input-root'] === undefined) {
    throw new Error('--input-root is required');
  }
  if (values['--shard-count'] === undefined) {
    throw new Error('--shard-count is required');
  }
  return {
    kind: 'run',
    inputRoot: values['--input-root'],
    outputRoot: values['--output'],
    shardCount: Number(values['--shard-count']),
    policyRoot: values['--policy-root'],
  };
}

function validateCommonSummaries(shardReports) {
  const expected = shardReports[0].summary;
  for (const [index, { summary }] of shardReports.entries()) {
    for (const property of COMMON_SUMMARY_PROPERTIES) {
      if (summary[property] !== expected[property]) {
        throw new Error(`Quality shard ${String(index)} ${property} does not match shard 0`);
      }
    }
  }
}

function commonSummary(summary) {
  return Object.fromEntries(
    COMMON_SUMMARY_PROPERTIES.map((property) => [property, summary[property]]),
  );
}

function analyzerExclusions(analyzers) {
  return [...new Set(analyzers.flatMap(({ exclusions = [] }) => exclusions))].sort();
}

function mergeEntries(shardReports, property) {
  return shardReports.flatMap((report) => report[property]);
}

const invokedPath = process.argv[1];
if (
  invokedPath !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(invokedPath)).href
) {
  process.exitCode = runAggregateCli();
}
