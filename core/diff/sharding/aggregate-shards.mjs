import { realpathSync } from 'node:fs';
import path from 'node:path';
import { configuredAnalyzers } from '../../../languages/typescript/preset/diff/configured-analyzers.mjs';
import { planAnalyzerShards } from './sharding.mjs';
import { resolveMetadata } from './metadata.mjs';
import { readAndValidateShard, validateCommonSummaries, commonSummary } from './read-shards.mjs';
import { sortByToolAndPath, policyHash, summaryFields } from '../reporting/report-model.mjs';
import {
  writeDiffReports,
  clearDiffReports,
  absoluteTextReportPath,
} from '../reporting/reporters.mjs';
import { parseArguments } from './arguments.mjs';
import { resolveProjectRoot } from '../../tooling/tool-resolution.mjs';
import { pathToFileURL } from 'node:url';
import { loadConfig, describeConfigOverrides } from '../../configuration/config.mjs';
import { configureAnalyzers } from '../../configuration/configure-analyzers.mjs';
import { presetAnalyzers } from '../../configuration/preset-analyzers.mjs';
import { resolveHeadPolicy } from '../../../languages/typescript/preset/head-policy.mjs';
import { renderConsoleSummary } from '../reporting/summary.mjs';
import { AGGREGATE_USAGE_TEXT } from '../../help/usage-text.mjs';

function resolvePolicyRoot({ policyRoot, optionsPolicyRoot, currentProjectRoot }) {
  if (policyRoot !== undefined) {
    return realpathSync(policyRoot);
  }
  return optionsPolicyRoot === undefined
    ? undefined
    : realpathSync(path.resolve(currentProjectRoot, optionsPolicyRoot));
}

export function aggregateShardReports({
  inputRoot,
  outputRoot,
  analyzers = configuredAnalyzers(),
  shardCount,
  liveProjectRoot,
  policyRoot,
  configOverrides = [],
}) {
  const plan = planAnalyzerShards(analyzers, shardCount);
  const analyzerResolutionErrors = resolveMetadata({
    analyzers,
    liveProjectRoot,
    policyRoot,
    inputRoot,
  });
  const shardReports = plan.map((shardAnalyzers, index) =>
    readAndValidateShard(inputRoot, index, shardAnalyzers),
  );
  validateCommonSummaries(shardReports);

  const { newFindings, resolvedFindings, changedMetrics, heldFindings, toolErrors } =
    mergeShardEntries(shardReports, analyzerResolutionErrors);
  const summary = aggregateSummary({
    shardReports,
    analyzers,
    configOverrides,
    newFindings,
    toolErrors,
  });
  const report = {
    summary,
    newFindings: sortByToolAndPath(newFindings),
    resolvedFindings: sortByToolAndPath(resolvedFindings),
    unchangedFindings: sortByToolAndPath(heldFindings),
    changedMetrics: sortByToolAndPath(changedMetrics),
    toolErrors: sortByToolAndPath(toolErrors),
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
      stdout.write(AGGREGATE_USAGE_TEXT);
      return 0;
    }
    currentProjectRoot =
      currentProjectRoot === undefined ? resolveProjectRoot() : realpathSync(currentProjectRoot);
    outputRoot = path.resolve(
      currentProjectRoot,
      options.outputRoot ?? 'reports/quality/diff/combined',
    );
    clearDiffReports(outputRoot);
    const report = configuredReport(options, {
      currentProjectRoot,
      outputRoot,
      analyzers,
      policyRoot,
    });
    return reportExitCode(report, { stdout, environment, outputRoot });
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

function aggregateSummary({ shardReports, analyzers, configOverrides, newFindings, toolErrors }) {
  const toolsByName = new Map(
    shardReports.flatMap(({ summary }) => summary.tools.map((tool) => [tool.name, tool])),
  );
  return {
    ...commonSummary(shardReports[0].summary),
    policyHash: policyHash(analyzers, configOverrides),
    ...summaryFields(configOverrides, shardReports[0].summary),
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
}

function configuredReport(options, { currentProjectRoot, outputRoot, analyzers, policyRoot }) {
  const config = loadConfig(currentProjectRoot);
  return aggregateShardReports({
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
}

function reportExitCode(report, { stdout, environment, outputRoot }) {
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
}
