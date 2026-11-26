import {
  MEMORY_TOOL,
  type MemoryUse,
  isMemoryKill,
  measuredMemory,
  memoryKillMessage,
  withoutKillRemedy,
} from '../../../../shared/processes/memory/memory-kills.mts';
import type { AnalyzerReport, Finding, ReportEntry } from '../../../../shared/values/findings.mts';
import { textOf } from '../../../../shared/values/readers.mts';

export { MEMORY_TOOL };

type KilledRun = {
  readonly reports: Map<string, AnalyzerReport>;
  readonly toolErrors: ReportEntry[];
};

function isKilledFinding(finding: Finding): boolean {
  return finding.classification === 'tool-error' && isMemoryKill(finding.message);
}

function killedAnalyzers({ reports, toolErrors }: KilledRun): string[] {
  const fromErrors = toolErrors
    .filter((entry) => isMemoryKill(entry.message))
    .map((entry) => textOf(entry.tool));
  const fromReports = [...reports]
    .filter(([, report]) => report.findings.some((finding) => isKilledFinding(finding)))
    .map(([name]) => name);
  return [...new Set([...fromErrors, ...fromReports])].sort();
}

function shortenedFinding(finding: Finding): Finding {
  return isKilledFinding(finding)
    ? { ...finding, message: withoutKillRemedy(finding.message) }
    : finding;
}

function shortenedEntry(entry: ReportEntry): ReportEntry {
  return isMemoryKill(entry.message)
    ? { ...entry, message: withoutKillRemedy(textOf(entry.message)) }
    : entry;
}

export function withMemoryKillReport<Run extends KilledRun>(
  run: Run,
  snapshot: string,
  measure: () => MemoryUse = measuredMemory,
): Run {
  const killed = killedAnalyzers(run);
  if (killed.length < 2) {
    return run;
  }
  const reports = new Map(
    [...run.reports].map(([name, report]): [string, AnalyzerReport] => [
      name,
      { ...report, findings: report.findings.map((finding) => shortenedFinding(finding)) },
    ]),
  );
  const toolErrors = [
    ...run.toolErrors.map((entry) => shortenedEntry(entry)),
    { tool: MEMORY_TOOL, snapshot, message: memoryKillMessage(killed, measure()) },
  ];
  return { ...run, reports, toolErrors };
}
