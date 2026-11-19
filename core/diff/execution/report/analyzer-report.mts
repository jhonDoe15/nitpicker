import { parseAnalyzerReportKeepingValid } from '../../comparison/schema/invalid-findings.mjs';
import {
  TROUBLESHOOTING_ANCHORS,
  troubleshootingError,
  withTroubleshooting,
} from '../../../../shared/messages/troubleshooting.mjs';
import { textOf } from '../../../../shared/values/readers.mts';
import type { AnalyzerTask } from '../tasks.mts';
import { MEMORY_ADVICE, isOutOfMemory } from '../../../../shared/processes/memory/node-heap.mts';

export type AnalyzerReport = { readonly findings: readonly { readonly tool?: unknown }[] };

type ChildOutput = {
  readonly status: unknown;
  readonly signal: unknown;
  readonly stdoutText: string;
  readonly stderrText: string;
};

type ReportedTask = Pick<AnalyzerTask, 'name' | 'acceptedExitCodes' | 'reportedTools'>;

const parseKeepingValid: (value: unknown, analyzerName: string) => AnalyzerReport =
  parseAnalyzerReportKeepingValid;

export function reportFromAnalyzerOutput(
  task: ReportedTask,
  { status, signal, stdoutText, stderrText }: ChildOutput,
): AnalyzerReport {
  if (typeof status !== 'number' || !task.acceptedExitCodes.includes(status)) {
    throw troubleshootingError(
      crashMessage(task.name, { status, signal, stdoutText, stderrText }),
      TROUBLESHOOTING_ANCHORS.analyzerCrashed,
    );
  }
  return parseReport(stdoutText, task.name, task.reportedTools);
}

function crashMessage(
  name: string,
  { status, signal, stdoutText, stderrText }: ChildOutput,
): string {
  if (isOutOfMemory(stderrText)) {
    return `${name} ran out of memory. ${MEMORY_ADVICE}`;
  }
  const exit = status === null ? `signal ${textOf(signal ?? 'unknown')}` : `exit ${textOf(status)}`;
  const detail = stderrText.trim() || stdoutText.trim() || 'no diagnostic output';
  const killed =
    signal === 'SIGKILL'
      ? ' A SIGKILL usually means the system ran out of memory. ' + MEMORY_ADVICE
      : '';
  return `${name} crashed with ${exit}: ${detail}${killed}`;
}

function parsedReport(rawReport: unknown, analyzerName: string): AnalyzerReport {
  try {
    return parseKeepingValid(rawReport, analyzerName);
  } catch (error) {
    if (error instanceof Error) {
      error.message = textOf(
        withTroubleshooting(error.message, TROUBLESHOOTING_ANCHORS.analyzerCrashed),
      );
    }
    throw error;
  }
}

function parseReport(
  stdout: string,
  analyzerName: string,
  reportedTools: readonly unknown[] = [],
): AnalyzerReport {
  let rawReport: unknown;
  try {
    rawReport = JSON.parse(stdout);
  } catch (error) {
    throw troubleshootingError(
      `${analyzerName} did not produce valid JSON`,
      TROUBLESHOOTING_ANCHORS.analyzerCrashed,
      { cause: error },
    );
  }
  const report = parsedReport(rawReport, analyzerName);
  const mismatchedFinding = report.findings.find(
    (finding) => finding.tool !== analyzerName && !reportedTools.includes(finding.tool),
  );
  if (mismatchedFinding !== undefined) {
    throw troubleshootingError(
      `${analyzerName} emitted a finding for unexpected tool ${textOf(mismatchedFinding.tool)}`,
      TROUBLESHOOTING_ANCHORS.analyzerCrashed,
    );
  }
  return report;
}
