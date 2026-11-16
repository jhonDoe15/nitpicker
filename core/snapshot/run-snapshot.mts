import {
  analyzerMetadata as metadataOf,
  analyzerName as nameOf,
} from '../diff/reporting/report-model.mts';
import { withHeadPolicyFile } from '../../languages/typescript/preset/head-policy.mjs';
import type { MetadataMap } from '../diff/execution/report/analyzer-metadata.mts';
import { runAnalyzers } from '../diff/execution/run-analyzers.mts';
import { scopeSummary } from '../scope/scope-findings.mjs';
import { fieldOf, textOf } from '../../shared/values/readers.mts';
import { type ReportEntry, entriesOf } from '../../shared/values/findings.mts';
import { inFocus, isEnforceable, labelSummary } from './snapshot-labels.mts';
import type { LabelFilter } from '../labels/taxonomy.mts';
import { withoutCrossToolOverlaps } from '../../shared/findings/overlaps/cross-tool.mjs';
import { withSharedUnusedDirectives } from '../../languages/typescript/adapters/eslint/merge/unused-directives.mts';

type Finding = ReportEntry;

type Scope = unknown;

type SnapshotRun = {
  readonly reports: ReadonlyMap<string, { readonly findings: readonly Finding[] }>;
  readonly toolErrors: Finding[];
  readonly metadata: MetadataMap;
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

const withPolicyFile: <Run>(headPolicy: object, run: (headPolicyFile: unknown) => Run) => Run =
  withHeadPolicyFile;
const withoutOverlaps: <Run>(run: Run) => Run = withoutCrossToolOverlaps;
const scopeFields: (scope: Scope, outside: number) => object = scopeSummary;

function sortKey(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

type HeadRunRequest = {
  readonly analyzers: readonly unknown[];
  readonly projectRoot: string;
  readonly policyRoot: string;
  readonly toolRoot: unknown;
  readonly liveProjectRoot: string;
  readonly headPolicy: object;
  readonly scope: Scope;
  readonly execution: Readonly<Record<string, unknown>>;
};

function headRun({ analyzers, headPolicy, scope, execution, ...roots }: HeadRunRequest) {
  return withoutOverlaps(
    withSharedUnusedDirectives(
      withPolicyFile(headPolicy, (headPolicyFile) =>
        runAnalyzers({
          analyzers,
          ...roots,
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
    ),
  );
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
  const {
    reports,
    toolErrors: runErrors,
    metadata,
  } = headRun({
    analyzers,
    projectRoot,
    policyRoot,
    toolRoot,
    liveProjectRoot,
    headPolicy,
    scope,
    execution,
  });

  const toolErrors = [...entriesOf(setupErrors), ...runErrors];
  const collected = collectSnapshotFindings({
    analyzers,
    reports,
    toolErrors,
    scope,
    metadata,
    labels,
  });

  return {
    summary: snapshotSummary({ ...collected, scope, analyzers, toolErrors, startedAt, labels }),
    findings: sortFindings(collected.findings),
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
  readonly labels: LabelFilter | undefined;
  readonly hidden: number;
};

function snapshotSummary({
  scope,
  outside,
  tools,
  analyzers,
  findings,
  toolErrors,
  startedAt,
  labels,
  hidden,
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
    ...labelSummary(labels, hidden, findings),
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
  {
    analyzer,
    name,
    metadata,
  }: { readonly analyzer: unknown; readonly name: unknown; readonly metadata: MetadataMap },
  analyzerFindings: readonly Finding[],
): ToolSummary {
  return {
    name,
    version: metadataOf(analyzer, 'version', metadata),
    configurationHash: metadataOf(analyzer, 'configurationHash', metadata),
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
  metadata,
  labels,
}: SnapshotRun & {
  readonly analyzers: readonly unknown[];
  readonly scope: Scope;
  readonly metadata: MetadataMap;
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
    tools.push(summarizeAnalyzer({ analyzer, name, metadata }, focused.findings));
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
