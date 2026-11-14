import { createHash } from 'node:crypto';
import type { ReportEntry } from '../../../shared/values/findings.mts';
import { fieldOf, listOf } from '../../../shared/values/readers.mts';

type SortableEntry = {
  readonly tool?: unknown;
  readonly path?: unknown;
  readonly rule?: unknown;
  readonly identity?: unknown;
};

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
): string {
  const policy = analyzers.map((analyzer, index) => ({
    name: analyzerName(analyzer, index),
    version: analyzerMetadata(analyzer, 'version'),
    configurationHash: analyzerMetadata(analyzer, 'configurationHash'),
    exclusions: listOf(fieldOf(analyzer, 'exclusions')),
  }));
  const hashed = configOverrides.length === 0 ? policy : { policy, configOverrides };
  return createHash('sha256').update(JSON.stringify(hashed)).digest('hex');
}

export function summaryFields(
  configOverrides: unknown,
  shardSummary: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  const { policyDigest, policyAcceptanceSource } = shardSummary;
  return {
    configOverrides,
    policyChanges: shardSummary['policyChanges'] ?? [],
    policyLoosenings: shardSummary['policyLoosenings'] ?? [],
    ...(policyDigest === undefined ? {} : { policyDigest }),
    policyChangeAccepted: shardSummary['policyChangeAccepted'] === true,
    ...(policyAcceptanceSource === undefined ? {} : { policyAcceptanceSource }),
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

export function analyzerMetadata(analyzer: unknown, property: string): string {
  const value = fieldOf(analyzer, property);
  return typeof value === 'string' ? value : 'unknown';
}

export function heldFindingsOf<T extends ReportEntry>(report: {
  readonly unchangedFindings: readonly T[];
}): T[] {
  return report.unchangedFindings.filter((finding) => finding['heldAtBase'] !== undefined);
}
