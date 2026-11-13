import path from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { fieldOf } from '../../../shared/values/readers.mts';

export type Entry = Readonly<Record<string, unknown>> & {
  readonly tool?: unknown;
  readonly name?: unknown;
  readonly message?: unknown;
  readonly classification?: unknown;
};

export type ShardSummary = Entry & {
  readonly tools: readonly Entry[];
  readonly elapsedMs: number;
  readonly overallStatus: string;
};

export type ShardEntries = {
  readonly newFindings: readonly Entry[];
  readonly resolvedFindings: readonly Entry[];
  readonly changedMetrics: readonly Entry[];
  readonly heldFindings: readonly Entry[];
  readonly toolErrors: readonly Entry[];
  readonly notes: readonly Entry[];
};

export type ShardReport = ShardEntries & { readonly summary: ShardSummary };

export type UnchangedShard = {
  readonly summary: ShardSummary;
  readonly toolErrors: readonly Entry[];
};

type ExpectedAnalyzer = {
  readonly name: string;
  readonly version?: unknown;
  readonly configurationHash?: unknown;
};

type EntryCheck = { readonly expectedNames: ReadonlySet<unknown>; readonly shardIndex: number };

const COMMON_SUMMARY_PROPERTIES = [
  'requestedBaseRef',
  'resolvedBaseSha',
  'mergeBaseSha',
  'headSha',
  'renamedPaths',
];

function isEntryList(value: unknown): value is readonly Entry[] {
  return Array.isArray(value);
}

function isShardSummary(value: unknown): value is ShardSummary {
  return isEntryList(fieldOf(value, 'tools'));
}

function isSummaryRecord(value: unknown): value is ShardSummary {
  return typeof value === 'object' && value !== null;
}

type RawEntries = Readonly<Record<keyof ShardEntries, unknown>>;

export function readAndValidateShard(
  inputRoot: string,
  index: number,
  expectedAnalyzers: readonly ExpectedAnalyzer[],
): ShardReport {
  const shardRoot = path.join(inputRoot, String(index));
  const summary = readJson(shardRoot, 'summary.json', index);
  const raw: RawEntries = {
    newFindings: readJson(shardRoot, 'new-findings.json', index),
    resolvedFindings: readJson(shardRoot, 'resolved-findings.json', index),
    changedMetrics: readJson(shardRoot, 'changed-metrics.json', index),
    heldFindings: readOptionalJson(shardRoot, 'held-findings.json', index) ?? [],
    toolErrors: readJson(shardRoot, 'tool-errors.json', index),
    notes: readOptionalJson(shardRoot, 'notes.json', index) ?? [],
  };
  const expectedNames = expectedAnalyzers.map(({ name }) => name);
  const shardSummary = checkedSummary(summary, expectedNames, index);
  for (const [toolIndex, analyzer] of expectedAnalyzers.entries()) {
    const tool = shardSummary.tools[toolIndex];
    if (
      fieldOf(tool, 'version') !== analyzer.version ||
      fieldOf(tool, 'configurationHash') !== analyzer.configurationHash
    ) {
      throw new Error(`Quality shard ${String(index)} has stale policy for ${analyzer.name}`);
    }
  }
  const check = {
    expectedNames: new Set([...expectedNames, 'nitpicker-config']),
    shardIndex: index,
  };
  return { summary: shardSummary, ...checkedShardEntries(raw, check) };
}

function checkedSummary(
  summary: unknown,
  expectedNames: readonly string[],
  index: number,
): ShardSummary {
  const tools = fieldOf(summary, 'tools');
  const actualNames = isEntryList(tools) ? tools.map(({ name }) => name) : undefined;
  if (!isShardSummary(summary) || JSON.stringify(actualNames) !== JSON.stringify(expectedNames)) {
    throw new Error(
      `Quality shard ${String(index)} expected analyzers ${expectedNames.join(', ')} but reported ${(actualNames ?? []).join(', ')}`,
    );
  }
  return summary;
}

function checkedShardEntries(raw: RawEntries, check: EntryCheck): ShardEntries {
  const newFindings = checkedEntries(raw.newFindings, 'newFindings', check);
  const resolvedFindings = checkedEntries(raw.resolvedFindings, 'resolvedFindings', check);
  const changedMetrics = checkedEntries(raw.changedMetrics, 'changedMetrics', check);
  const heldFindings = checkedEntries(raw.heldFindings, 'heldFindings', check);
  const notes = checkedEntries(raw.notes, 'notes', check);
  const toolErrors = checkedToolErrors(raw.toolErrors, check);
  return { newFindings, resolvedFindings, changedMetrics, heldFindings, toolErrors, notes };
}

export function readUnchangedShards(
  inputRoot: string,
  shardCount: number,
): UnchangedShard[] | undefined {
  const shards = Array.from({ length: shardCount }, (_, index) => {
    const shardRoot = path.join(inputRoot, String(index));
    return {
      summary: readJson(shardRoot, 'summary.json', index),
      toolErrors: readJson(shardRoot, 'tool-errors.json', index),
    };
  });
  if (!shards.some(({ summary }) => noChanges(summary))) {
    return undefined;
  }
  const unchanged = shards.map(unchangedShard);
  validateCommonSummaries(unchanged);
  const changed = unchanged.findIndex(({ summary }) => summary['noChanges'] !== true);
  if (changed !== -1) {
    throw new Error(
      `Quality shard ${String(changed)} ran the analyzers, but another shard found no changes`,
    );
  }
  return unchanged;
}

function noChanges(summary: unknown): boolean {
  if (summary === null || summary === undefined) {
    throw new TypeError('Quality shard summary must be an object');
  }
  return fieldOf(summary, 'noChanges') === true;
}

function unchangedShard({
  summary,
  toolErrors,
}: {
  readonly summary: unknown;
  readonly toolErrors: unknown;
}): UnchangedShard {
  if (!(isSummaryRecord(summary) && isEntryList(toolErrors))) {
    throw new TypeError('Quality shard summary and tool errors must be JSON values');
  }
  return { summary, toolErrors };
}

function shardFile(root: string, fileName: string, shardIndex: number): string {
  const filePath = path.resolve(root, fileName);
  if (!filePath.startsWith(`${path.resolve(root)}${path.sep}`)) {
    throw new Error(`Quality shard ${String(shardIndex)} file ${fileName} is outside its folder`);
  }
  return filePath;
}

function readOptionalJson(root: string, fileName: string, shardIndex: number): unknown {
  return existsSync(shardFile(root, fileName, shardIndex))
    ? readJson(root, fileName, shardIndex)
    : undefined;
}

export function readJson(root: string, fileName: string, shardIndex: number): unknown {
  const filePath = shardFile(root, fileName, shardIndex);
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(
      `Quality shard ${String(shardIndex)} could not read ${fileName}: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
}

function checkedEntries(
  entries: unknown,
  property: string,
  { expectedNames, shardIndex }: EntryCheck,
): readonly Entry[] {
  if (!isEntryList(entries)) {
    throw new TypeError(`Quality shard ${String(shardIndex)} ${property} must be an array`);
  }
  const unexpected = entries.find(({ tool }) => !expectedNames.has(tool));
  if (unexpected !== undefined) {
    throw new Error(
      `Quality shard ${String(shardIndex)} reported unexpected analyzer ${String(unexpected.tool)}`,
    );
  }
  return entries;
}

function checkedToolErrors(
  toolErrors: unknown,
  { expectedNames, shardIndex }: EntryCheck,
): readonly Entry[] {
  if (!isEntryList(toolErrors)) {
    throw new TypeError(`Quality shard ${String(shardIndex)} toolErrors must be an array`);
  }
  const unexpectedError = toolErrors.find(
    ({ tool }) => tool !== 'analyzer-scheduler' && !expectedNames.has(tool),
  );
  if (unexpectedError !== undefined) {
    throw new Error(
      `Quality shard ${String(shardIndex)} reported unexpected analyzer ${String(unexpectedError.tool)}`,
    );
  }
  return toolErrors;
}

function findMismatchedProperty(summary: Entry, expected: Entry): string | undefined {
  return COMMON_SUMMARY_PROPERTIES.find((property) => summary[property] !== expected[property]);
}

export function validateCommonSummaries(
  shardReports: readonly { readonly summary: ShardSummary }[],
): void {
  const expected = shardReports[0]?.summary;
  for (const [index, { summary }] of shardReports.entries()) {
    const mismatch = expected === undefined ? undefined : findMismatchedProperty(summary, expected);
    if (mismatch !== undefined) {
      throw new Error(`Quality shard ${String(index)} ${mismatch} does not match shard 0`);
    }
  }
}

export function commonSummary(summary: Entry): Entry {
  return Object.fromEntries(
    COMMON_SUMMARY_PROPERTIES.map((property) => [property, summary[property]]),
  );
}
