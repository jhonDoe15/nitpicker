import { sumToolCount, formatSeconds } from './format/text.mjs';
import { heldFindings as heldGroups, heldLine as heldEntryLine } from './format/held-findings.mts';
import { noteSectionLines as noteLines } from './format/notes.mts';
import { noticeSection } from './review/notices.mts';
import { policyChangeSection } from './review/policy-changes.mts';
import { quickLines, stagedLines } from '../../quick/summary.mjs';
import { partialRunLines } from './partial-run/partial-run.mts';
import { skippedLines } from '../skipping/lines.mts';
import { metricChange } from './console/metric-values.mts';
import { cleanLine, isActiveDiffTool, splitTools } from './console/tool-table.mts';
import { repositoryUrl } from '../../../shared/reference/facts.mjs';
import { helpUriFor, referenceLinks } from '../../../shared/reference/store.mjs';
import { scopeLine } from '../../scope/scope-findings.mjs';
import type { ReferenceLinks, ReportData, ReportEntry } from '../../../shared/values/findings.mts';
import { fieldOf, listOf, textOf } from '../../../shared/values/readers.mts';
import {
  failingFirstLines,
  findingSectionLines,
  ruleFilterSection,
  toolErrorSectionLines,
} from './console/text-sections.mts';

type Summary = ReportData['summary'];

const seconds: (elapsedMs: unknown) => string = formatSeconds;
const toolCountSum: (tools: unknown, property: string) => number = sumToolCount;
const stagedLinesOf: (summary: unknown) => readonly string[] = stagedLines;
const quickLinesOf: (summary: unknown) => readonly unknown[] = quickLines;
const scopeLinesOf: (summary: unknown) => readonly string[] = scopeLine;
const docsUrl: (relativePath: string, anchor: undefined, root: unknown) => unknown = repositoryUrl;
const helpUri: (links: ReferenceLinks, finding: ReportEntry) => unknown = helpUriFor;
const links: () => ReferenceLinks = referenceLinks;
const skippedLinesOf: (summary: unknown) => readonly string[] = skippedLines;
const changeOf: (metric: ReportEntry) => string = metricChange;
const activeAndClean: (
  tools: readonly unknown[],
  isActive: (tool: unknown) => boolean,
) => { readonly active: unknown[]; readonly clean: number } = splitTools;
const isActive: (tool: unknown) => boolean = isActiveDiffTool;
const cleanLineOf: (clean: number) => string = cleanLine;

function field(value: unknown, key: string): string {
  return textOf(fieldOf(value, key));
}

export function renderTextReport(
  report: ReportData,
  { reference = links() }: { readonly reference?: ReferenceLinks } = {},
): string {
  const lines: unknown[] = [
    ...summaryLines(report),
    ...configOverrideLines(listOf(report.summary['configOverrides'])),
    ...policyChangeSection(report.summary),
    ...noticeSection(listOf(report.summary['notices'])),
    ...toolCountLines(report.summary),
  ];
  lines.push(...failingFirstLines('New', report.newFindings));
  lines.push(...ruleReferenceLines(report.newFindings, reference));
  appendHeldSection(lines, report.unchangedFindings);
  lines.push(...findingSectionLines('Resolved findings', report.resolvedFindings));
  appendMetricSection(lines, report.changedMetrics);
  lines.push(...toolErrorSectionLines(report.toolErrors));
  lines.push(...noteLines(report.notes));
  return `${lines.join('\n')}\n`;
}

function summaryLines(report: ReportData): unknown[] {
  const { summary } = report;
  return [
    'Nitpicker quality diff',
    `Base ref: ${field(summary, 'requestedBaseRef')}`,
    `Merge base: ${field(summary, 'mergeBaseSha')}`,
    `Head: ${field(summary, 'headSha')}`,
    ...stagedLinesOf(summary),
    `Status: ${field(summary, 'overallStatus')}`,
    ...scopeLinesOf(summary),
    `New enforceable findings: ${field(summary, 'newEnforceableFindings')}`,
    `New findings: ${String(report.newFindings.length)}`,
    `Resolved findings: ${String(report.resolvedFindings.length)}`,
    `Unchanged findings: ${String(toolCountSum(summary['tools'], 'unchanged'))}`,
    `Changed metrics: ${String(report.changedMetrics.length)}`,
    `Tool errors: ${String(report.toolErrors.length)}`,
    ...partialRunLines(summary),
    ...skippedLinesOf(summary),
    ...quickLinesOf(summary),
  ];
}

function configOverrideLines(configOverrides: readonly unknown[]): string[] {
  if (configOverrides.length === 0) {
    return [];
  }
  return ['', 'Config overrides:', ...configOverrides.map((override) => `  ${String(override)}`)];
}

function toolCountLines(summary: Summary): string[] {
  const tools = listOf(summary['tools']);
  if (summary['skippedAll'] === true) {
    return ['Analyzers: none ran, no changed file is in their inputs'];
  }
  if (summary['noChanges'] === true) {
    return ['Analyzers: none ran, the head has the same files as the merge base'];
  }
  if (tools.length === 0) {
    return ['Analyzers: none configured'];
  }
  const { active, clean } = activeAndClean(tools, isActive);
  return [
    '',
    'Per-tool counts:',
    ...active.map(toolCountLine),
    ...(clean === 0 ? [] : [cleanLineOf(clean)]),
  ];
}

function toolCountLine(tool: unknown): string {
  const skipped =
    fieldOf(tool, 'skippedBecause') === undefined
      ? ''
      : ` skipped (${field(tool, 'skippedBecause')} failed)`;
  const counts = `base=${field(tool, 'base')} head=${field(tool, 'head')} new=${field(tool, 'new')} resolved=${field(tool, 'resolved')}`;
  const unchanged = `unchanged=${field(tool, 'unchanged')} changed-metrics=${field(tool, 'changedMetrics')}`;
  const elapsed = seconds(fieldOf(tool, 'elapsedMs') ?? 0);
  return `${field(tool, 'name')}: ${counts} ${unchanged} elapsed=${elapsed}${skipped}`;
}

export function renderRuleFilterSection(
  report: ReportData,
  ruleFilters: readonly string[],
): string {
  return ruleFilterSection(ruleFilters, [
    ['  New', report.newFindings],
    ['  Unchanged', report.unchangedFindings],
    ['  Resolved', report.resolvedFindings],
  ]);
}

export function ruleReferenceLines(
  findings: readonly ReportEntry[],
  reference: ReferenceLinks,
): string[] {
  const known = findings.some((finding) => helpUri(reference, finding) !== undefined);
  const url = known ? docsUrl('docs/rules/README.md', undefined, reference.root()) : undefined;
  return url === undefined
    ? []
    : ['', `Rule reference: ${textOf(url)} (nitpicker explain <tool/rule> prints one rule)`];
}

function appendHeldSection(lines: unknown[], unchangedFindings: readonly ReportEntry[]): void {
  const { metrics, lint } = heldGroups(unchangedFindings);
  if (metrics.length > 0) {
    lines.push('', 'Touched, still over limit (not failing):', ...metrics.map(heldEntryLine));
  }
  if (lint.length > 0) {
    lines.push(
      '',
      'Existing lint findings in edited code (not failing):',
      ...lint.map(heldEntryLine),
    );
  }
}

function appendMetricSection(lines: unknown[], metrics: readonly ReportEntry[]): void {
  if (metrics.length === 0) {
    return;
  }
  lines.push('', 'Changed metrics:');
  for (const metric of metrics) {
    lines.push(
      `${textOf(metric.tool)}/${textOf(metric.rule)} ${textOf(metric.path)} ${field(metric, 'metric')}: ${changeOf(metric)}`,
    );
  }
}
