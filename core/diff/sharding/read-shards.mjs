import path from 'node:path';
import { existsSync, readFileSync } from 'node:fs';

const COMMON_SUMMARY_PROPERTIES = [
  'requestedBaseRef',
  'resolvedBaseSha',
  'mergeBaseSha',
  'headSha',
  'renamedPaths',
];

export function readAndValidateShard(inputRoot, index, expectedAnalyzers) {
  const shardRoot = path.join(inputRoot, String(index));
  const report = {
    summary: readJson(shardRoot, 'summary.json', index),
    newFindings: readJson(shardRoot, 'new-findings.json', index),
    resolvedFindings: readJson(shardRoot, 'resolved-findings.json', index),
    changedMetrics: readJson(shardRoot, 'changed-metrics.json', index),
    heldFindings: readOptionalJson(shardRoot, 'held-findings.json', index) ?? [],
    toolErrors: readJson(shardRoot, 'tool-errors.json', index),
    notes: readOptionalJson(shardRoot, 'notes.json', index) ?? [],
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

function readOptionalJson(root, fileName, shardIndex) {
  return existsSync(path.join(root, fileName)) ? readJson(root, fileName, shardIndex) : undefined;
}

export function readJson(root, fileName, shardIndex) {
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
  for (const property of [
    'newFindings',
    'resolvedFindings',
    'changedMetrics',
    'heldFindings',
    'notes',
  ]) {
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

function findMismatchedProperty(summary, expected) {
  return COMMON_SUMMARY_PROPERTIES.find((property) => summary[property] !== expected[property]);
}

export function validateCommonSummaries(shardReports) {
  const expected = shardReports[0].summary;
  for (const [index, { summary }] of shardReports.entries()) {
    const mismatch = findMismatchedProperty(summary, expected);
    if (mismatch !== undefined) {
      throw new Error(`Quality shard ${String(index)} ${mismatch} does not match shard 0`);
    }
  }
}

export function commonSummary(summary) {
  return Object.fromEntries(
    COMMON_SUMMARY_PROPERTIES.map((property) => [property, summary[property]]),
  );
}
