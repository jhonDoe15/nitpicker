import type { Finding, ReportData } from '../../../../shared/values/findings.mts';
import type { ReportParts } from './bare-report.mts';

export function finding(overrides: Partial<Finding> = {}): Finding {
  return {
    tool: 'eslint',
    rule: 'no-console',
    path: 'src/a.js',
    identity: 'a:1',
    message: 'Unexpected console statement',
    classification: 'enforceable',
    location: { line: 12, column: 3 },
    ...overrides,
  };
}

export function report({
  newFindings = [],
  toolErrors = [],
  unchangedFindings = [],
}: ReportParts = {}): ReportData {
  return {
    summary: {
      requestedBaseRef: 'main',
      mergeBaseSha: 'abc',
      headSha: 'def',
      overallStatus: toolErrors.length === 0 ? 'completed' : 'tool-error',
      newEnforceableFindings: newFindings.length,
      elapsedMs: 1500,
      tools: [
        { name: 'eslint', base: 0, head: 1, new: 1, resolved: 0, unchanged: 0, elapsedMs: 40 },
      ],
    },
    newFindings,
    resolvedFindings: [],
    unchangedFindings,
    changedMetrics: [],
    toolErrors,
  };
}
