import { findingLabeler } from '../../../../labels/finding-labels.mts';
import { priorityRank } from '../../../../labels/finding-priority.mts';
import { areaOf, areaRank } from './finding-areas.mts';
import type { ReportEntry } from '../../../../../shared/values/findings.mts';
import { fieldOf, textOf } from '../../../../../shared/values/readers.mts';

const COLUMN_FIELD = 'column';
const LABELS_OF = findingLabeler({ areaOf });

function rankOf(finding: ReportEntry): number {
  return priorityRank(LABELS_OF(finding));
}

function byPosition(left: ReportEntry, right: ReportEntry): number {
  const leftPath = textOf(left.path);
  const rightPath = textOf(right.path);
  return (
    Number(leftPath > rightPath) - Number(leftPath < rightPath) ||
    Number(fieldOf(left['location'], 'line') ?? Infinity) -
      Number(fieldOf(right['location'], 'line') ?? Infinity) ||
    Number(fieldOf(left['location'], COLUMN_FIELD) ?? 0) -
      Number(fieldOf(right['location'], COLUMN_FIELD) ?? 0)
  );
}

export function byPriority(left: ReportEntry, right: ReportEntry): number {
  return (
    rankOf(left) - rankOf(right) ||
    areaRank(left.tool) - areaRank(right.tool) ||
    byPosition(left, right)
  );
}

export function inPriorityOrder<T extends ReportEntry>(findings: readonly T[]): T[] {
  return findings.toSorted(byPriority);
}
