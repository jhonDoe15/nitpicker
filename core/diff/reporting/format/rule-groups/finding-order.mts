import { findingLabeler } from '../../../../labels/finding-labels.mts';
import { broadRuleCheck, primaryKind, priorityRank } from '../../../../labels/finding-priority.mts';
import { areaOf, areaRank } from './finding-areas.mts';
import type { ReportEntry } from '../../../../../shared/values/findings.mts';
import { fieldOf, textOf } from '../../../../../shared/values/readers.mts';

const COLUMN_FIELD = 'column';
const LABELS_OF = findingLabeler({ areaOf });
const IS_BROAD = broadRuleCheck();

function rankOf(finding: ReportEntry): number {
  return priorityRank(LABELS_OF(finding), IS_BROAD(finding));
}

export function isStyleFinding(finding: ReportEntry): boolean {
  return primaryKind(LABELS_OF(finding)) === 'style';
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

type Ranked<T> = { readonly finding: T; readonly rank: number; readonly area: number };

function byRank<T extends ReportEntry>(left: Ranked<T>, right: Ranked<T>): number {
  return (
    left.rank - right.rank || left.area - right.area || byPosition(left.finding, right.finding)
  );
}

export function inPriorityOrder<T extends ReportEntry>(findings: readonly T[]): T[] {
  return findings
    .map((finding) => ({ finding, rank: rankOf(finding), area: areaRank(finding.tool) }))
    .toSorted(byRank)
    .map(({ finding }) => finding);
}
