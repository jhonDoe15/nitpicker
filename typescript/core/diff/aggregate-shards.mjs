import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { configuredAnalyzers } from '../../preset/diff/configured-analyzers.mjs';
import {
  clearDiffReports,
  relativeTextReportPath,
  renderConsoleSummary,
  writeDiffReports,
} from './reporters.mjs';
import { policyHash, sortByToolAndPath } from './report-model.mjs';
import { planAnalyzerShards } from './sharding.mjs';

const projectRoot = path.resolve(import.meta.dirname, '../..');
const COMMON_SUMMARY_PROPERTIES = [
  'requestedBaseRef',
  'resolvedBaseSha',
  'mergeBaseSha',
  'headSha',
  'renamedPaths',
];

export function aggregateShardReports({
  inputRoot,
  outputRoot,
  analyzers = configuredAnalyzers,
  shardCount,
}) {
  const plan = planAnalyzerShards(analyzers, shardCount);
  const shardReports = plan.map((shardAnalyzers, index) =>
    readAndValidateShard(inputRoot, index, shardAnalyzers),
  );
  validateCommonSummaries(shardReports);

  const newFindings = mergeEntries(shardReports, 'newFindings');
  const resolvedFindings = mergeEntries(shardReports, 'resolvedFindings');
  const changedMetrics = mergeEntries(shardReports, 'changedMetrics');
  const toolErrors = mergeEntries(shardReports, 'toolErrors');
  const toolsByName = new Map(
    shardReports.flatMap(({ summary }) => summary.tools.map((tool) => [tool.name, tool])),
  );
  const summary = {
    ...commonSummary(shardReports[0].summary),
    policyHash: policyHash(analyzers),
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
    unchangedFindings: [],
    changedMetrics: sortByToolAndPath(changedMetrics),
    toolErrors: sortByToolAndPath(toolErrors),
  };
  report.text = writeDiffReports(outputRoot, report);
  return report;
}

export function runAggregateCli({
  arguments_ = process.argv.slice(2),
  currentProjectRoot = projectRoot,
  analyzers = configuredAnalyzers,
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
          ' --shard-count <count> [--output <directory>]\n',
      );
      return 0;
    }
    outputRoot = path.resolve(
      currentProjectRoot,
      options.outputRoot ?? 'reports/quality/diff/combined',
    );
    clearDiffReports(outputRoot);
    const report = aggregateShardReports({
      inputRoot: path.resolve(currentProjectRoot, options.inputRoot),
      outputRoot,
      analyzers,
      shardCount: options.shardCount,
    });
    stdout.write(
      renderConsoleSummary(report, {
        color: environment.NO_COLOR === undefined,
        diagnosticsPath: relativeTextReportPath(currentProjectRoot, outputRoot),
      }),
    );
    if (report.summary.overallStatus !== 'completed') {
      return 2;
    }
    return report.summary.newEnforceableFindings > 0 ? 1 : 0;
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

function parseArguments(arguments_) {
  const values = {};
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === '--help') {
      return { kind: 'help' };
    }
    if (!['--input-root', '--output', '--shard-count'].includes(argument)) {
      throw new Error(`Unknown argument: ${argument}`);
    }
    const value = arguments_[index + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`${argument} requires a value`);
    }
    values[argument] = value;
    index += 1;
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
  };
}

function readAndValidateShard(inputRoot, index, expectedAnalyzers) {
  const shardRoot = path.join(inputRoot, String(index));
  const report = {
    summary: readJson(shardRoot, 'summary.json', index),
    newFindings: readJson(shardRoot, 'new-findings.json', index),
    resolvedFindings: readJson(shardRoot, 'resolved-findings.json', index),
    changedMetrics: readJson(shardRoot, 'changed-metrics.json', index),
    toolErrors: readJson(shardRoot, 'tool-errors.json', index),
  };
  const expectedNames = expectedAnalyzers.map(({ name }) => name);
  const actualNames = report.summary.tools?.map(({ name }) => name);
  if (JSON.stringify(actualNames) !== JSON.stringify(expectedNames)) {
    throw new Error(
      `Quality shard ${String(index)} expected analyzers ${expectedNames.join(', ')} but reported ${(actualNames ?? []).join(', ')}`,
    );
  }
  for (const [toolIndex, analyzer] of expectedAnalyzers.entries()) {
    const tool = report.summary.tools[toolIndex];
    if (
      tool.version !== analyzer.version ||
      tool.configurationHash !== analyzer.configurationHash
    ) {
      throw new Error(`Quality shard ${String(index)} has stale policy for ${analyzer.name}`);
    }
  }
  validateShardEntries(report, new Set(expectedNames), index);
  return report;
}

function readJson(root, fileName, shardIndex) {
  const filePath = path.join(root, fileName);
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(
      `Quality shard ${String(shardIndex)} could not read ${fileName}: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
}

function validateShardEntries(report, expectedNames, shardIndex) {
  for (const property of ['newFindings', 'resolvedFindings', 'changedMetrics']) {
    if (!Array.isArray(report[property])) {
      throw new TypeError(`Quality shard ${String(shardIndex)} ${property} must be an array`);
    }
    const unexpected = report[property].find(({ tool }) => !expectedNames.has(tool));
    if (unexpected !== undefined) {
      throw new Error(
        `Quality shard ${String(shardIndex)} reported unexpected analyzer ${unexpected.tool}`,
      );
    }
  }
  if (!Array.isArray(report.toolErrors)) {
    throw new TypeError(`Quality shard ${String(shardIndex)} toolErrors must be an array`);
  }
  const unexpectedError = report.toolErrors.find(
    ({ tool }) => tool !== 'analyzer-scheduler' && !expectedNames.has(tool),
  );
  if (unexpectedError !== undefined) {
    throw new Error(
      `Quality shard ${String(shardIndex)} reported unexpected analyzer ${unexpectedError.tool}`,
    );
  }
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
