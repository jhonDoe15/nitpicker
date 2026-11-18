import { findingLabeler, labelCounts } from '../labels/finding-labels.mts';
import { areaOf } from '../diff/reporting/format/rule-groups/finding-areas.mts';
import { labeledFindings, labelRun } from '../labels/label-filter.mts';
import type { LabelFilter } from '../labels/taxonomy.mts';
import { isInScope } from '../scope/scope-findings.mjs';
import type { ReportEntry } from '../../shared/values/findings.mts';

type Finding = ReportEntry;

const LABELS_OF = findingLabeler({ areaOf });
const inScope: (findingPath: unknown, scope: unknown) => boolean = isInScope;

export function isEnforceable(finding: Finding): boolean {
  return finding.classification === 'enforceable';
}

export function inFocus(
  analyzed: readonly Finding[],
  scope: unknown,
  labels: LabelFilter | undefined,
): { readonly findings: Finding[]; readonly outside: number; readonly hidden: number } {
  const scoped = analyzed.filter((finding) => inScope(finding.path, scope));
  const labeled = labeledFindings(scoped, labels, LABELS_OF);
  return { ...labeled, outside: analyzed.length - scoped.length };
}

export function labelSummary(
  labels: LabelFilter | undefined,
  hidden: number,
  findings: readonly Finding[],
): object {
  const failing = findings.filter(isEnforceable);
  return {
    ...labelRun(labels, hidden),
    ...(failing.length === 0
      ? {}
      : { labelCounts: labelCounts(failing.map((finding) => ({ labels: LABELS_OF(finding) }))) }),
  };
}
