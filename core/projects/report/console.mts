import { CONFIG_FILE_NAME } from '../../../shared/config.mts';
import { textOf } from '../../../shared/values/readers.mts';
import { DECLARED_ORIGIN } from '../discovery/declared-projects.mts';
import type { MonorepoPlan, PlanProject } from '../project-types.mts';
import type { CombinedSummary } from './combined-summary.mts';

type SummaryEntry = CombinedSummary['projects'][number];
type SummaryCounts = CombinedSummary['counts'];

export type PlanView = {
  readonly source: MonorepoPlan['source'];
  readonly projects: readonly { readonly origin?: unknown }[];
};
export type RowView = {
  readonly project: Pick<PlanProject, 'path' | 'preset'>;
  readonly selection: { readonly selected: boolean; readonly reason?: string | undefined };
};
export type SummaryView = {
  readonly counts: Pick<SummaryCounts, 'projects' | 'failed' | 'errored' | 'passed' | 'skipped'>;
  readonly projects: readonly SummaryEntry[];
};

const PROJECT = 'project';
const SKIPPED = 'skipped';

const MAX_LISTED_FILES = 5;
const MARKS: Readonly<Record<string, string>> = {
  passed: '✓',
  failed: '✖',
  error: '!',
  skipped: '-',
};

export function count(total: number, word: string): string {
  return `${String(total)} ${word}${total === 1 ? '' : 's'}`;
}

function originsOf(plan: PlanView): string {
  return [...new Set(plan.projects.map(({ origin }) => origin))].join(', ');
}

function expandedOf(plan: PlanView): string {
  const counts = new Map<unknown, number>();
  for (const { origin } of plan.projects) {
    if (origin !== DECLARED_ORIGIN) {
      counts.set(origin, (counts.get(origin) ?? 0) + 1);
    }
  }
  const parts = [...counts].map(([origin, total]) => `${String(total)} from ${textOf(origin)}`);
  return parts.length === 0 ? '' : ` (${parts.join(', ')})`;
}

function introduction(plan: PlanView): string {
  const total = count(plan.projects.length, PROJECT);
  if (plan.source === 'declared') {
    return `Monorepo: ${total} listed in "projects" of ${CONFIG_FILE_NAME}${expandedOf(plan)}.`;
  }
  return (
    `Monorepo: ${total} detected (${originsOf(plan)}). ` +
    `List them in "projects" of ${CONFIG_FILE_NAME} to choose them; ` +
    '"projects": [] keeps this repository one project.'
  );
}

function planLine({ project, selection }: RowView): string {
  const verb = selection.selected ? 'run ' : 'skip';
  return `  ${verb} ${project.path} (${project.preset}): ${textOf(selection.reason)}`;
}

function skippedLines<T>(
  entries: readonly T[],
  reasonOf: (entry: T) => string | undefined,
): string[] {
  const byReason = new Map<string | undefined, number>();
  for (const entry of entries) {
    const reason = reasonOf(entry);
    byReason.set(reason, (byReason.get(reason) ?? 0) + 1);
  }
  return [...byReason].map(
    ([reason, total]) =>
      `  skip ${count(total, PROJECT)}: ${textOf(reason)} (--details lists them)`,
  );
}

function planLines(rows: readonly RowView[], details: boolean): string[] {
  if (details) {
    return rows.map(planLine);
  }
  const ran = rows.filter(({ selection }) => selection.selected);
  const skipped = rows.filter(({ selection }) => !selection.selected);
  return [...ran.map(planLine), ...skippedLines(skipped, ({ selection }) => selection.reason)];
}

function outsideLine(outside: readonly string[]): string[] {
  if (outside.length === 0) {
    return [];
  }
  const listed = outside.slice(0, MAX_LISTED_FILES).join(', ');
  const more =
    outside.length > MAX_LISTED_FILES
      ? ` and ${String(outside.length - MAX_LISTED_FILES)} more`
      : '';
  return [`Changed files outside every project, not checked: ${listed}${more}`];
}

export function renderPlan({
  plan,
  rows,
  outside,
  details,
}: {
  readonly plan: PlanView;
  readonly rows: readonly RowView[];
  readonly outside: readonly string[];
  readonly details: boolean;
}): string {
  const lines = [introduction(plan), ...planLines(rows, details), ...outsideLine(outside)];
  return `${lines.join('\n')}\n`;
}

function firstLine(text: string): string {
  return text.split('\n')[0] ?? '';
}

function resultText({
  status,
  newEnforceableFindings = 0,
  reason,
  error,
  overallStatus,
  report,
}: SummaryEntry): string {
  if (status === SKIPPED) {
    return `skipped (${textOf(reason)})`;
  }
  if (status === 'error') {
    return error === undefined
      ? 'tool errors, the run is incomplete'
      : `failed to run: ${firstLine(error)}${report === undefined ? '' : ` (${report}/report.txt)`}`;
  }
  if (status === 'passed') {
    return 'no new violations';
  }
  const found = count(newEnforceableFindings, 'new enforceable violation');
  return overallStatus === 'tool-error'
    ? `${found}, and tool errors: the run is incomplete`
    : found;
}

function headline({ counts }: SummaryView): string {
  const stats: [number, string][] = [
    [counts.failed, 'failed'],
    [counts.errored, 'incomplete'],
    [counts.passed, 'passed'],
    [counts.skipped, SKIPPED],
  ];
  const parts = stats
    .filter(([total]) => total > 0)
    .map(([total, word]) => `${String(total)} ${word}`);
  return `Monorepo summary: ${parts.join(', ')} (${count(counts.projects, PROJECT)})`;
}

function summaryLine(entry: SummaryEntry): string {
  return `  ${textOf(MARKS[entry.status])} ${entry.path} (${entry.preset}): ${resultText(entry)}`;
}

function summaryLines(projects: readonly SummaryEntry[], details: boolean): string[] {
  if (details) {
    return projects.map(summaryLine);
  }
  const ran = projects.filter(({ status }) => status !== SKIPPED);
  const skipped = projects.filter(({ status }) => status === SKIPPED);
  return [
    ...ran.map(summaryLine),
    ...skippedLines(skipped, ({ reason }) => reason).map((line) =>
      line.replace('  skip ', `  ${textOf(MARKS['skipped'])} `),
    ),
  ];
}

export function renderSummary({
  summary,
  summaryPath,
  details,
}: {
  readonly summary: SummaryView;
  readonly summaryPath: string;
  readonly details: boolean;
}): string {
  const lines = summaryLines(summary.projects, details);
  const closing = `Combined report: ${summaryPath}`;
  const all = [headline(summary), ...lines, closing];
  return `\n${all.join('\n')}\n`;
}

export function projectHeading(project: {
  readonly path: string;
  readonly preset: string;
}): string {
  return `\n== ${project.path} (${project.preset}) ==\n`;
}
