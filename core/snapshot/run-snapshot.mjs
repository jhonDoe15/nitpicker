import { analyzerMetadata, analyzerName } from '../diff/reporting/report-model.mjs';
import { withHeadPolicyFile } from '../../languages/typescript/preset/head-policy.mjs';
import { runAnalyzers } from '../diff/execution/run-analyzers.mjs';

export function runQualitySnapshot({
  analyzers,
  projectRoot,
  policyRoot = projectRoot,
  toolRoot = projectRoot,
  liveProjectRoot = projectRoot,
  startedAt = Date.now(),
  headPolicy = {},
  runTasks,
}) {
  const { reports, toolErrors } = withHeadPolicyFile(headPolicy, (headPolicyFile) =>
    runAnalyzers({
      analyzers,
      projectRoot,
      policyRoot,
      toolRoot,
      liveProjectRoot,
      headPolicyFile,
      snapshot: 'head',
      runTasks,
    }),
  );

  const { findings, tools } = collectSnapshotFindings(analyzers, reports, toolErrors);

  const enforceableFindings = findings.filter(
    (finding) => finding.classification === 'enforceable',
  ).length;
  const exclusions = declaredExclusions(analyzers);
  const overallStatus = overallStatusFor({ toolErrors, enforceableFindings });

  return {
    summary: {
      tools,
      exclusions,
      elapsedMs: Date.now() - startedAt,
      overallStatus,
      enforceableFindings,
    },
    findings: sortFindings(findings),
    toolErrors: sortFindings(toolErrors.map((error) => ({ ...error, path: error.path ?? '' }))),
  };
}

function overallStatusFor({ toolErrors, enforceableFindings }) {
  if (toolErrors.length > 0) {
    return 'tool-error';
  }
  return enforceableFindings > 0 ? 'violations' : 'clean';
}

function sortFindings(entries) {
  return entries.sort(
    (left, right) =>
      (left.tool ?? '').localeCompare(right.tool ?? '') ||
      (left.path ?? '').localeCompare(right.path ?? '') ||
      (left.rule ?? '').localeCompare(right.rule ?? '') ||
      (left.identity ?? '').localeCompare(right.identity ?? ''),
  );
}

function collectSnapshotFindings(analyzers, reports, toolErrors) {
  const findings = [];
  const tools = [];
  for (const [index, analyzer] of analyzers.entries()) {
    const name = analyzerName(analyzer, index);
    const analyzerFindings = [];
    for (const finding of reports.get(analyzer.name)?.findings ?? []) {
      if (finding.classification === 'tool-error') {
        toolErrors.push({
          tool: finding.tool,
          snapshot: 'head',
          rule: finding.rule,
          path: finding.path,
          message: finding.message,
        });
        continue;
      }
      analyzerFindings.push(finding);
    }
    findings.push(...analyzerFindings);
    tools.push({
      name,
      version: analyzerMetadata(analyzer, 'version'),
      configurationHash: analyzerMetadata(analyzer, 'configurationHash'),
      total: analyzerFindings.length,
      enforceable: analyzerFindings.filter((finding) => finding.classification === 'enforceable')
        .length,
      descriptive: analyzerFindings.filter((finding) => finding.classification === 'descriptive')
        .length,
    });
  }

  return { findings, tools };
}

function declaredExclusions(analyzers) {
  return [
    ...new Set(
      analyzers.flatMap((analyzer) =>
        typeof analyzer === 'object' && analyzer !== null && Array.isArray(analyzer.exclusions)
          ? analyzer.exclusions.filter((exclusion) => typeof exclusion === 'string')
          : [],
      ),
    ),
  ].sort();
}
