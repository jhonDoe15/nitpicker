import { realpathSync } from 'node:fs';
import path from 'node:path';
import {
  type AggregateCli,
  type AggregateOptions,
  type AggregateReport,
  type AggregateRequest,
  type ConfiguredTarget,
  type Entry,
  type ExitTarget,
  type PolicyRootRequest,
  type ReportTarget,
  type RepositoryLocation,
  type ShardEntries,
  type ShardReport,
  type UnchangedPolicy,
  type UnchangedShard,
  aggregateSummary,
  configuredAnalyzers,
  planAnalyzerShards,
  resolveMetadata,
  readAndValidateShard,
  readUnchangedShards,
  validateCommonSummaries,
  commonSummary,
  noChangesReport,
  sortByToolAndPath,
  writeDiffReports,
  parseArguments,
  resolveProjectRoot,
  withTroubleshooting,
  describeError,
  displayPath,
  withoutAnsi,
} from './aggregate-summary.mts';
import { clearDiffReports, absoluteTextReportPath } from '../reporting/reporters.mts';
import { GitCommandError, runGit } from '../git/repository/command.mjs';
import { pathToFileURL } from 'node:url';
import { loadConfig, describeConfigOverrides } from '../../configuration/config.mjs';
import { configureAnalyzers } from '../../configuration/configure-analyzers.mjs';
import { presetAnalyzers } from '../../configuration/preset-analyzers.mts';
import { resolveHeadPolicy } from '../../../languages/typescript/preset/head-policy.mjs';
import { renderConsoleSummary } from '../reporting/summary.mts';
import { AGGREGATE_USAGE_TEXT } from '../../help/usage-text.mts';
import { TROUBLESHOOTING_ANCHORS } from '../../../shared/messages/troubleshooting.mjs';
import { writeGithubOutput } from '../reporting/github/emit.mts';
import { colorEnabled } from '../../../shared/messages/terminal/terminal-text.mjs';
import { comparisonExitCode } from '../reporting/failing-tests/failing-tests.mts';
import { analyzersOf } from '../../../shared/values/analyzers.mts';
import { textOf } from '../../../shared/values/readers.mts';
import type { NitpickerConfig } from '../../configuration/config-types.mts';

function resolvePolicyRoot({
  optionsPolicyRoot,
  currentProjectRoot,
}: PolicyRootRequest): string | undefined {
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
  warn,
}: AggregateRequest): AggregateReport {
  const plan = planAnalyzerShards(analyzers, shardCount);
  const unchangedShards = readUnchangedShards(inputRoot, plan.length);
  if (unchangedShards !== undefined) {
    const report = unchangedReport(unchangedShards, { analyzers, configOverrides });
    return writeAggregate(report, { outputRoot, liveProjectRoot });
  }
  const analyzerResolutionErrors = resolveMetadata({
    analyzers,
    liveProjectRoot,
    policyRoot,
    inputRoot,
    warn,
  });
  const shardReports = plan.map((shardAnalyzers, index) =>
    readAndValidateShard(inputRoot, index, shardAnalyzers),
  );
  validateCommonSummaries(shardReports);

  const { newFindings, resolvedFindings, changedMetrics, heldFindings, toolErrors, notes } =
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
    notes: sortByToolAndPath(notes),
  };
  return writeAggregate(report, { outputRoot, liveProjectRoot });
}

function writeAggregate(
  report: AggregateReport,
  { outputRoot, liveProjectRoot }: ReportTarget,
): AggregateReport {
  report.text = writeDiffReports(outputRoot, report, repositoryLocationOf(liveProjectRoot));
  return report;
}

function unchangedReport(
  shards: readonly [UnchangedShard, ...UnchangedShard[]],
  { analyzers, configOverrides }: UnchangedPolicy,
): AggregateReport {
  const report = noChangesReport({
    analyzers,
    configOverrides,
    comparison: commonSummary(shards[0].summary),
    startedAt: Date.now(),
    additionalToolErrors: sortByToolAndPath(shards.flatMap(({ toolErrors }) => toolErrors)),
  });
  report.summary.elapsedMs = Math.max(...shards.map(({ summary }) => summary.elapsedMs));
  return report;
}

function repositoryLocationOf(liveProjectRoot: string | undefined): RepositoryLocation {
  if (liveProjectRoot === undefined) {
    return {};
  }
  try {
    const [repositoryRoot, projectPath] = runGit(liveProjectRoot, [
      'rev-parse',
      '--show-toplevel',
      '--show-prefix',
    ]).split('\n');
    return { projectPath, repositoryRoot };
  } catch (error) {
    if (error instanceof GitCommandError) {
      return {};
    }
    throw error;
  }
}

function mergeShardEntries(
  shardReports: readonly ShardReport[],
  analyzerResolutionErrors: readonly Entry[],
): ShardEntries {
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
  analyzers,
  stdout = process.stdout,
  stderr = process.stderr,
  environment = process.env,
}: AggregateCli = {}): number {
  let outputRoot: string | undefined;
  try {
    const options = parseArguments(arguments_);
    if (options.kind === 'help') {
      stdout.write(AGGREGATE_USAGE_TEXT);
      return 0;
    }
    const projectRoot =
      currentProjectRoot === undefined ? resolveProjectRoot() : realpathSync(currentProjectRoot);
    outputRoot = path.resolve(projectRoot, options.outputRoot ?? 'reports/quality/diff/combined');
    clearDiffReports(outputRoot);
    const report = configuredReport(options, {
      currentProjectRoot: projectRoot,
      outputRoot,
      analyzers,
      warn: (message) => stderr.write(`nitpicker: ${message}\n`),
    });
    return reportExitCode(report, {
      stdout,
      stderr,
      environment,
      outputRoot,
      currentProjectRoot: projectRoot,
      details: options.details,
    });
  } catch (error) {
    if (outputRoot !== undefined) {
      clearDiffReports(outputRoot);
    }
    stderr.write(`Quality shard aggregation failed: ${aggregationFailure(error)}\n`);
    return 2;
  }
}

function aggregationFailure(error: unknown): string {
  return withTroubleshooting(describeError(error), TROUBLESHOOTING_ANCHORS.shardAggregationFails);
}

function mergeEntries(shardReports: readonly ShardReport[], property: keyof ShardEntries): Entry[] {
  return shardReports
    .flatMap((report) => report[property])
    .map((entry) =>
      typeof entry.message === 'string' ? { ...entry, message: withoutAnsi(entry.message) } : entry,
    );
}

const invokedPath = process.argv[1];

if (
  invokedPath !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(invokedPath)).href
) {
  process.exitCode = runAggregateCli();
}

function configuredReport(
  options: AggregateOptions,
  { currentProjectRoot, outputRoot, analyzers, warn }: ConfiguredTarget,
): AggregateReport {
  const config: NitpickerConfig = loadConfig(currentProjectRoot);
  return aggregateShardReports({
    inputRoot: path.resolve(currentProjectRoot, options.inputRoot),
    outputRoot,
    analyzers: analyzersOf(
      configureAnalyzers(
        presetAnalyzers(config, analyzers),
        config,
        resolveHeadPolicy(config, currentProjectRoot),
      ),
    ),
    configOverrides: describeConfigOverrides(config),
    shardCount: options.shardCount,
    liveProjectRoot: currentProjectRoot,
    warn,
    policyRoot: resolvePolicyRoot({
      optionsPolicyRoot: options.policyRoot,
      currentProjectRoot,
    }),
  });
}

function reportExitCode(
  report: AggregateReport,
  { stdout, stderr, environment, outputRoot, currentProjectRoot, details }: ExitTarget,
): number {
  stdout.write(
    textOf(
      renderConsoleSummary(report, {
        color: colorEnabled(stdout, environment),
        details,
        diagnosticsPath: displayPath(absoluteTextReportPath(outputRoot)),
      }),
    ),
  );
  writeGithubOutput({
    kind: 'diff',
    report,
    projectRoot: currentProjectRoot,
    environment,
    stdout,
    stderr,
  });
  return comparisonExitCode(report);
}
