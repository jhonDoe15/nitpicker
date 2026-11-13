import { parseAnalyzerReport, parseFinding } from '../finding-schema.mjs';
import { isRecord } from './values.mjs';
import {
  TROUBLESHOOTING_ANCHORS,
  withTroubleshooting,
} from '../../../../shared/messages/troubleshooting.mjs';
import type { AnalyzerReport, Finding } from '../../../../shared/values/findings.mts';
import { textOf } from '../../../../shared/values/readers.mts';

type ProblemContext = {
  readonly context: string;
  readonly analyzerName: string;
  readonly problems: Map<string, string[]>;
};

const reportOf: (value: unknown, analyzerName: string) => AnalyzerReport = parseAnalyzerReport;
const findingOf: (value: unknown, context: string) => Finding = parseFinding;
const plainObject: (value: unknown) => boolean = isRecord;

const INVALID_RULE = 'invalid-finding';

function isObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return plainObject(value);
}

function invalidFindingsError(
  tool: string,
  analyzerName: string,
  problems: readonly string[],
): Finding {
  const count = problems.length === 1 ? 'a finding' : `${String(problems.length)} findings`;
  return {
    tool,
    rule: INVALID_RULE,
    path: '.',
    identity: INVALID_RULE,
    message: textOf(
      withTroubleshooting(
        `${analyzerName} reported ${count} that nitpicker cannot check, left out of the result; its other findings are kept. First: ${textOf(problems[0])}`,
        TROUBLESHOOTING_ANCHORS.analyzerCrashed,
      ),
    ),
    classification: 'tool-error',
  };
}

function toolOf(finding: unknown, analyzerName: string): string {
  return isObject(finding) && typeof finding['tool'] === 'string' && finding['tool'] !== ''
    ? finding['tool']
    : analyzerName;
}

function parsedOrProblem(
  finding: unknown,
  { context, analyzerName, problems }: ProblemContext,
): Finding[] {
  try {
    return [findingOf(finding, context)];
  } catch (error) {
    if (!(error instanceof TypeError)) {
      throw error;
    }
    const tool = toolOf(finding, analyzerName);
    problems.set(tool, [...(problems.get(tool) ?? []), error.message]);
    return [];
  }
}

export function parseAnalyzerReportKeepingValid(
  value: unknown,
  analyzerName: string,
): AnalyzerReport {
  if (!(isObject(value) && Array.isArray(value['findings']))) {
    return reportOf(value, analyzerName);
  }
  const listed: readonly unknown[] = value['findings'];
  const report = reportOf({ ...value, findings: [] }, analyzerName);
  const problems = new Map<string, string[]>();
  const findings = listed.flatMap((finding, index) =>
    parsedOrProblem(finding, {
      context: `${analyzerName} findings[${String(index)}]`,
      analyzerName,
      problems,
    }),
  );
  return {
    ...report,
    findings: [
      ...findings,
      ...[...problems].map(([tool, messages]) =>
        invalidFindingsError(tool, analyzerName, messages),
      ),
    ],
  };
}
