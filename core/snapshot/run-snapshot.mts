import { analyzerMetadata, analyzerName } from '../diff/reporting/report-model.mjs';
import { withHeadPolicyFile } from '../../languages/typescript/preset/head-policy.mjs';
import { runAnalyzers } from '../diff/execution/run-analyzers.mjs';
import { isInScope, scopeSummary } from '../scope/scope-findings.mjs';
import { fieldOf } from '../../shared/values/readers.mts';

type Finding = {
  readonly tool?: string | undefined;
  readonly path?: string | undefined;
  readonly rule?: string | undefined;
  readonly identity?: string | undefined;
  readonly classification?: string | undefined;
  readonly message?: unknown;
};

type AnalyzerRequest = Readonly<
  Record<
    | 'analyzers'
    | 'projectRoot'
    | 'policyRoot'
    | 'toolRoot'
    | 'snapshot'
    | 'baselineRoot'
    | 'baselineMovesFile'
    | 'liveProjectRoot'
    | 'headPolicyFile'
    | 'mutationScope'
    | 'logRoot'
    | 'runTasks',
    unknown
  >
>;

type Scope = unknown;

type AnalyzerRun = {
  readonly reports: ReadonlyMap<unknown, { readonly findings?: readonly Finding[] }>;
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
  run: (headPolicyFile: unknown) => AnalyzerRun,
) => AnalyzerRun = withHeadPolicyFile;
const runAll: (request: AnalyzerRequest) => AnalyzerRun = runAnalyzers;
const metadataOf: (analyzer: unknown, property: string) => unknown = analyzerMetadata;
const nameOf: (analyzer: unknown, index: number) => unknown = analyzerName;
const inScope: (findingPath: string | undefined, scope: Scope) => boolean = isInScope;
const scopeFields: (scope: Scope, outside: number) => object = scopeSummary;

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
  ...execution
}: SnapshotRequest): QualitySnapshot {
  const { reports, toolErrors } = withPolicyFile(headPolicy, (headPolicyFile) =>
    runAll({
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
  );

  const { findings, tools, outside } = collectSnapshotFindings({
    analyzers,
    reports,
    toolErrors,
    scope,
  });

  return {
    summary: snapshotSummary({ scope, outside, tools, analyzers, findings, toolErrors, startedAt }),
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
      (left.tool ?? '').localeCompare(right.tool ?? '') ||
      (left.path ?? '').localeCompare(right.path ?? '') ||
      (left.rule ?? '').localeCompare(right.rule ?? '') ||
      (left.identity ?? '').localeCompare(right.identity ?? ''),
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
}: AnalyzerRun & { readonly analyzers: readonly unknown[]; readonly scope: Scope }): {
  readonly findings: Finding[];
  readonly tools: ToolSummary[];
  readonly outside: number;
} {
  const findings: Finding[] = [];
  const tools: ToolSummary[] = [];
  let outside = 0;
  for (const [index, analyzer] of analyzers.entries()) {
    const name = nameOf(analyzer, index);
    const reported = reports.get(fieldOf(analyzer, 'name'))?.findings ?? [];
    toolErrors.push(
      ...reported
        .filter((finding) => finding.classification === 'tool-error')
        .map((finding) => toSnapshotToolError(finding)),
    );
    const analyzed = reported.filter((finding) => finding.classification !== 'tool-error');
    const analyzerFindings = analyzed.filter((finding) => inScope(finding.path, scope));
    outside += analyzed.length - analyzerFindings.length;
    findings.push(...analyzerFindings);
    tools.push(summarizeAnalyzer(analyzer, name, analyzerFindings));
  }

  return { findings, tools, outside };
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
