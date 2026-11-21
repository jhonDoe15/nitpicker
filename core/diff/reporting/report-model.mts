import { createHash } from 'node:crypto';
import type { ReportEntry } from '../../../shared/values/findings.mts';
import type {
  HelpedFinding,
  ReferenceLinks,
} from '../../../shared/reference/typed/entry-types.mts';
import { referenceLinks, withHelpUris } from '../../../shared/reference/store.mts';
import { type MetadataMap, metadataValue } from '../execution/report/analyzer-metadata.mts';
import { fieldOf, listOf } from '../../../shared/values/readers.mts';

type SortableEntry = {
  readonly tool?: unknown;
  readonly path?: unknown;
  readonly rule?: unknown;
  readonly identity?: unknown;
};

function isHelped(entry: ReportEntry): entry is ReportEntry & HelpedFinding {
  return typeof entry.tool === 'string' && typeof entry.rule === 'string';
}

export function* helpLinkedEntries(
  entries: Iterable<ReportEntry>,
  reference: ReferenceLinks = referenceLinks(),
): Generator<ReportEntry> {
  for (const entry of entries) {
    yield isHelped(entry) ? (withHelpUris([entry], reference)[0] ?? entry) : entry;
  }
}

export function withHelpLinks(
  entries: readonly ReportEntry[],
  reference: ReferenceLinks = referenceLinks(),
): ReportEntry[] {
  return [...helpLinkedEntries(entries, reference)];
}

function sortText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function analyzerName(analyzer: unknown, index: number): string {
  const name = fieldOf(analyzer, 'name');
  return typeof name === 'string' && name.length > 0 ? name : `unknown-analyzer-${String(index)}`;
}

export function policyHash(
  analyzers: readonly unknown[],
  configOverrides: readonly unknown[] = [],
  metadata?: MetadataMap,
): string {
  const policy = analyzers.map((analyzer, index) => ({
    name: analyzerName(analyzer, index),
    version: analyzerMetadata(analyzer, 'version', metadata),
    configurationHash: analyzerMetadata(analyzer, 'configurationHash', metadata),
    exclusions: listOf(fieldOf(analyzer, 'exclusions')),
  }));
  const hashed = configOverrides.length === 0 ? policy : { policy, configOverrides };
  return createHash('sha256').update(JSON.stringify(hashed)).digest('hex');
}

export function summaryFields(
  configOverrides: unknown,
  shardSummary: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  return {
    configOverrides,
    notices: shardSummary['notices'] ?? [],
  };
}

export function sortByToolAndPath<T extends SortableEntry>(entries: readonly T[]): T[] {
  return entries.toSorted(
    (left, right) =>
      sortText(left.tool).localeCompare(sortText(right.tool)) ||
      sortText(left.path).localeCompare(sortText(right.path)) ||
      sortText(left.rule).localeCompare(sortText(right.rule)) ||
      sortText(left.identity).localeCompare(sortText(right.identity)),
  );
}

export function analyzerMetadata(
  analyzer: unknown,
  property: 'version' | 'configurationHash',
  metadata?: MetadataMap,
): string {
  const value = metadataValue(analyzer, property, metadata?.get(analyzer));
  return typeof value === 'string' ? value : 'unknown';
}

export function heldFindingsOf<T extends ReportEntry>(report: {
  readonly unchangedFindings: readonly T[];
}): T[] {
  return report.unchangedFindings.filter((finding) => finding['heldAtBase'] !== undefined);
}
