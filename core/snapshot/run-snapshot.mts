import {
  analyzerMetadata as metadataOf,
  analyzerName as nameOf,
} from '../diff/reporting/report-model.mts';
import { withHeadPolicyFile } from '../../languages/typescript/preset/head-policy.mjs';
import { runAnalyzers } from '../diff/execution/run-analyzers.mts';
import { isInScope, scopeSummary } from '../scope/scope-findings.mjs';
import { fieldOf, textOf } from '../../shared/values/readers.mts';
import { type ReportEntry, entriesOf } from '../../shared/values/findings.mts';
import { findingLabeler, labelCounts } from '../labels/finding-labels.mts';
import { areaOf } from '../diff/reporting/format/rule-groups/finding-areas.mts';
import { labeledFindings, labelRun } from '../labels/label-filter.mts';
import type { LabelFilter } from '../labels/taxonomy.mts';
import { withSharedUnusedDirectives } from '../../languages/typescript/adapters/eslint/merge/unused-directives.mjs';

type Finding = ReportEntry;

const LABELS_OF = findingLabeler({ areaOf });

type Scope = unknown;

type SnapshotRun = {
  readonly reports: ReadonlyMap<string, { readonly findings: readonly Finding[] }>;
  readonly toolErrors: Finding[];
};

type SnapshotRequest = {
  readonly analyzers: readonly unknown[];
  readonly projectRoot: string;
  readonly policyRoot?: string;
  readonly toolRoot?: unknown;
  readonly liveProjectRoot?: string;
  readonly startedAt?: number;
  readonly headPolicy?: object | undefined;
  readonly scope: Scope;
  readonly setupErrors?: readonly object[];
  readonly labels?: LabelFilter | undefined;
  readonly [option: string]: unknown;
};

type ToolSummary = {
  readonly name: unknown;
  readonly version: unknown;
  readonly configurationHash: unknown;
  readonly total: number;
  readonly enforceable: number;
  readonly descriptive: number;
};

export type QualitySnapshot = {
  readonly summary: {
    readonly tools: ToolSummary[];
    readonly exclusions: string[];
    readonly elapsedMs: number;
    readonly overallStatus: string;
    readonly enforceableFindings: number;
  };
  readonly findings: Finding[];
  readonly toolErrors: Finding[];
};

const withPolicyFile: (
  headPolicy: object,
  run: (headPolicyFile: unknown) => SnapshotRun,
) => SnapshotRun = withHeadPolicyFile;
const reconcileDirectives: (run: SnapshotRun, analyzers: readonly unknown[]) => SnapshotRun =
  withSharedUnusedDirectives;
const inScope: (findingPath: unknown, scope: Scope) => boolean = isInScope;
const scopeFields: (scope: Scope, outside: number) => object = scopeSummary;

function sortKey(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function isEnforceable(finding: Finding): boolean {
  return finding.classification === 'enforceable';
}

export function runQualitySnapshot({
  analyzers,
  projectRoot,
  policyRoot = projectRoot,
  toolRoot = projectRoot,
  liveProjectRoot = projectRoot,
  startedAt = Date.now(),
  headPolicy = {},
  scope,
  setupErrors = [],
  labels,
  ...execution
}: SnapshotRequest): QualitySnapshot {
  const { reports, toolErrors: runErrors } = reconcileDirectives(
    withPolicyFile(headPolicy, (headPolicyFile) =>
      runAnalyzers({
        analyzers,
        projectRoot,
        policyRoot,
        toolRoot,
        liveProjectRoot,
        headPolicyFile,
        snapshot: 'head',
        mutationScope: fieldOf(scope, 'paths'),
        baselineRoot: execution['baselineRoot'],
        baselineMovesFile: execution['baselineMovesFile'],
        logRoot: execution['logRoot'],
        runTasks: execution['runTasks'],
        ...execution,
      }),
    ),
    analyzers,
  );

  const toolErrors = [...entriesOf(setupErrors), ...runErrors];
  const { findings, tools, outside, hidden } = collectSnapshotFindings({
    analyzers,
    reports,
    toolErrors,
    scope,
    labels,
  });

  return {
    summary: {
      ...snapshotSummary({ scope, outside, tools, analyzers, findings, toolErrors, startedAt }),
      ...labelSummary(labels, hidden, findings),
    },
    findings: sortFindings(findings),
    toolErrors: sortFindings(toolErrors.map((error) => ({ ...error, path: error.path ?? '' }))),
  };
}

type SummaryParts = {
  readonly scope: Scope;
  readonly outside: number;
  readonly tools: ToolSummary[];
  readonly analyzers: readonly unknown[];
  readonly findings: readonly Finding[];
  readonly toolErrors: readonly Finding[];
  readonly startedAt: number;
};

function snapshotSummary({
  scope,
  outside,
  tools,
  analyzers,
  findings,
  toolErrors,
  startedAt,
}: SummaryParts): QualitySnapshot['summary'] {
  const enforceableFindings = findings.filter(isEnforceable).length;
  const exclusions = declaredExclusions(analyzers);
  const overallStatus = overallStatusFor({ toolErrors, enforceableFindings });
  return {
    ...scopeFields(scope, outside),
    tools,
    exclusions,
    elapsedMs: Date.now() - startedAt,
    overallStatus,
    enforceableFindings,
  };
}

function overallStatusFor({
  toolErrors,
  enforceableFindings,
}: {
  readonly toolErrors: readonly Finding[];
  readonly enforceableFindings: number;
}): string {
  if (toolErrors.length > 0) {
    return 'tool-error';
  }
  return enforceableFindings > 0 ? 'violations' : 'clean';
}

function sortFindings(entries: Finding[]): Finding[] {
  return entries.sort(
    (left, right) =>
      sortKey(left.tool).localeCompare(sortKey(right.tool)) ||
      sortKey(left.path).localeCompare(sortKey(right.path)) ||
      sortKey(left.rule).localeCompare(sortKey(right.rule)) ||
      sortKey(left['identity']).localeCompare(sortKey(right['identity'])),
  );
}

function toSnapshotToolError(finding: Finding): Finding & { readonly snapshot: string } {
  return {
    tool: finding.tool,
    snapshot: 'head',
    rule: finding.rule,
    path: finding.path,
    message: finding.message,
  };
}

function summarizeAnalyzer(
  analyzer: unknown,
  name: unknown,
  analyzerFindings: readonly Finding[],
): ToolSummary {
  return {
    name,
    version: metadataOf(analyzer, 'version'),
    configurationHash: metadataOf(analyzer, 'configurationHash'),
    total: analyzerFindings.length,
    enforceable: analyzerFindings.filter((finding) => finding.classification === 'enforceable')
      .length,
    descriptive: analyzerFindings.filter((finding) => finding.classification === 'descriptive')
      .length,
  };
}

function collectSnapshotFindings({
  analyzers,
  reports,
  toolErrors,
  scope,
  labels,
}: SnapshotRun & {
  readonly analyzers: readonly unknown[];
  readonly scope: Scope;
  readonly labels: LabelFilter | undefined;
}): {
  readonly findings: Finding[];
  readonly tools: ToolSummary[];
  readonly outside: number;
  readonly hidden: number;
} {
  const findings: Finding[] = [];
  const tools: ToolSummary[] = [];
  let outside = 0;
  let hidden = 0;
  for (const [index, analyzer] of analyzers.entries()) {
    const name = nameOf(analyzer, index);
    const reported = reports.get(textOf(fieldOf(analyzer, 'name')))?.findings ?? [];
    toolErrors.push(
      ...reported
        .filter((finding) => finding.classification === 'tool-error')
        .map((finding) => toSnapshotToolError(finding)),
    );
    const analyzed = reported.filter((finding) => finding.classification !== 'tool-error');
    const focused = inFocus(analyzed, scope, labels);
    outside += focused.outside;
    hidden += focused.hidden;
    findings.push(...focused.findings);
    tools.push(summarizeAnalyzer(analyzer, name, focused.findings));
  }

  return { findings, tools, outside, hidden };
}

function declaredExclusions(analyzers: readonly unknown[]): string[] {
  return [
    ...new Set(
      analyzers.flatMap((analyzer) => {
        const exclusions = fieldOf(analyzer, 'exclusions');
        return Array.isArray(exclusions)
          ? exclusions.filter((exclusion) => typeof exclusion === 'string')
          : [];
      }),
    ),
  ].sort();
}

function inFocus(
  analyzed: readonly Finding[],
  scope: Scope,
  labels: LabelFilter | undefined,
): { readonly findings: Finding[]; readonly outside: number; readonly hidden: number } {
  const scoped = analyzed.filter((finding) => inScope(finding.path, scope));
  const labeled = labeledFindings(scoped, labels, LABELS_OF);
  return { ...labeled, outside: analyzed.length - scoped.length };
}

function labelSummary(
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
