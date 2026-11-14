import type { LabelsOf } from './finding-labels.mts';
import { type LabelFilter, filterText, matchesFilter, selectedLabels } from './taxonomy.mts';
import { fieldOf, textOf } from '../../shared/values/readers.mts';

type Located = { readonly tool?: unknown; readonly rule?: unknown };

type Comparison<T> = {
  readonly newFindings: readonly T[];
  readonly resolvedFindings: readonly T[];
  readonly unchangedFindings: readonly T[];
  readonly changedMetrics: readonly T[];
};

type Outcome<T> = { readonly tool: object; readonly result: Comparison<T> };

type LabelRun = {
  readonly selected: readonly string[];
  readonly hidden: number;
  readonly message: string;
};

const ADVICE = 'Run nitpicker without --label before you finish.';

function kept<T extends Located>(
  findings: readonly T[],
  filter: LabelFilter | undefined,
  labelsOf: LabelsOf,
): T[] {
  return filter === undefined
    ? [...findings]
    : findings.filter((finding) => matchesFilter(labelsOf(finding), filter));
}

export function labeledFindings<T extends Located>(
  findings: readonly T[],
  filter: LabelFilter | undefined,
  labelsOf: LabelsOf,
): { readonly findings: T[]; readonly hidden: number } {
  const shown = kept(findings, filter, labelsOf);
  return { findings: shown, hidden: findings.length - shown.length };
}

export function labeledOutcomes<T extends Located, O extends Outcome<T>>(
  outcomes: readonly O[],
  filter: LabelFilter | undefined,
  labelsOf: LabelsOf,
): { readonly outcomes: O[]; readonly hidden: number } {
  let hidden = 0;
  const labeled = outcomes.map((outcome) => {
    const { result } = outcome;
    const newFindings = kept(result.newFindings, filter, labelsOf);
    hidden += result.newFindings.length - newFindings.length;
    const filtered = {
      newFindings,
      resolvedFindings: kept(result.resolvedFindings, filter, labelsOf),
      unchangedFindings: kept(result.unchangedFindings, filter, labelsOf),
      changedMetrics: kept(result.changedMetrics, filter, labelsOf),
    };
    return {
      ...outcome,
      tool: {
        ...outcome.tool,
        new: filtered.newFindings.length,
        resolved: filtered.resolvedFindings.length,
        unchanged: filtered.unchangedFindings.length,
        changedMetrics: filtered.changedMetrics.length,
      },
      result: { ...result, ...filtered },
    };
  });
  return { outcomes: labeled, hidden };
}

export function labelRun(filter: LabelFilter | undefined, hidden: number): object {
  if (filter === undefined) {
    return {};
  }
  const selected = selectedLabels(filter);
  const leftOut =
    hidden === 0
      ? ''
      : ` (${String(hidden)} ${hidden === 1 ? 'finding' : 'findings'} with other labels hidden)`;
  const labels: LabelRun = {
    selected,
    hidden,
    message: `Only findings labeled ${filterText(filter)}${leftOut}. ${ADVICE}`,
  };
  return { labels };
}

export function labelLines(summary: unknown): string[] {
  const labels = fieldOf(summary, 'labels');
  return labels === undefined ? [] : [textOf(fieldOf(labels, 'message'))];
}

export function labelCountLine(summary: unknown): string[] {
  const counts = fieldOf(summary, 'labelCounts');
  if (fieldOf(summary, 'labels') !== undefined || typeof counts !== 'object' || counts === null) {
    return [];
  }
  const parts = Object.entries(counts).map(([label, count]) => `${label} ${textOf(count)}`);
  return parts.length < 2 ? [] : [`  by label: ${parts.join(' · ')} (focus with --label <label>)`];
}
