import type { ReportData, ReportEntry } from '../../../../shared/values/findings.mts';

export type ReportParts = {
  readonly newFindings?: readonly ReportEntry[];
  readonly toolErrors?: readonly ReportEntry[];
  readonly unchangedFindings?: readonly ReportEntry[];
};

export function bareReport(parts: ReportParts = {}): ReportData {
  const { newFindings = [], toolErrors = [], unchangedFindings = [] } = parts;
  return {
    summary: {},
    newFindings,
    resolvedFindings: [],
    unchangedFindings,
    changedMetrics: [],
    toolErrors,
  };
}
