import { parseAnalyzerReportKeepingValid } from '../../comparison/schema/invalid-findings.mts';
import {
  TROUBLESHOOTING_ANCHORS,
  troubleshootingError,
  withTroubleshooting,
} from '../../../../shared/messages/troubleshooting.mts';
import { textOf } from '../../../../shared/values/readers.mts';
import type { AnalyzerTask } from '../tasks.mts';
import { parseJsonDescriptor } from '../../../../shared/report-output/pieces/json-lines.mts';
import { MEMORY_ADVICE, isOutOfMemory } from '../../../../shared/processes/memory/node-heap.mts';
import { KILL_SENTENCE } from '../../../../shared/processes/memory/memory-kills.mts';

export type AnalyzerReport = { readonly findings: readonly { readonly tool?: unknown }[] };

type ChildOutput = {
  readonly status: unknown;
  readonly signal: unknown;
  readonly stdoutText: string;
  readonly stderrText: string;
};

type FileOutput = {
  readonly status: unknown;
  readonly signal: unknown;
  readonly stdoutFile: {
    readonly descriptor: number;
    readonly read: (encoding: 'utf8', limit?: number) => string;
  };
  readonly stderrText: string;
};

type ReportedTask = Pick<AnalyzerTask, 'name' | 'acceptedExitCodes' | 'reportedTools'>;

const parseJson: (text: string) => unknown = JSON.parse;

const CRASH_STDOUT_BYTES = 1024 * 1024;

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
  return parseReport(() => parseJson(stdoutText), task.name, task.reportedTools);
}

export function reportFromAnalyzerFile(
  task: ReportedTask,
  { status, signal, stdoutFile, stderrText }: FileOutput,
): AnalyzerReport {
  if (typeof status !== 'number' || !task.acceptedExitCodes.includes(status)) {
    return reportFromAnalyzerOutput(task, {
      status,
      signal,
      stdoutText: stdoutFile.read('utf8', CRASH_STDOUT_BYTES),
      stderrText,
    });
  }
  return parseReport(
    () => parseJsonDescriptor(stdoutFile.descriptor, () => stdoutFile.read('utf8')),
    task.name,
    task.reportedTools,
  );
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
  const killed = signal === 'SIGKILL' ? KILL_SENTENCE : '';
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
  parsedStdout: () => unknown,
  analyzerName: string,
  reportedTools: readonly unknown[] = [],
): AnalyzerReport {
  let rawReport: unknown;
  try {
    rawReport = parsedStdout();
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
