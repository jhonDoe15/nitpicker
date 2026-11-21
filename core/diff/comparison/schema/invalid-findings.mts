import { parseAnalyzerReport, parseFinding } from '../finding-schema.mts';
import { expandMetricEntries, isRecord } from './values.mts';
import type { ParsedReport, TrackedFinding } from '../model/finding-types.mts';
import {
  TROUBLESHOOTING_ANCHORS,
  withTroubleshooting as untypedWithTroubleshooting,
} from '../../../../shared/messages/troubleshooting.mts';

const withTroubleshooting: (message: string, anchor: string) => string = untypedWithTroubleshooting;

const INVALID_RULE = 'invalid-finding';

type Problems = Map<string, string[]>;

function invalidFindingsError(
  tool: string,
  analyzerName: string,
  problems: readonly string[],
): TrackedFinding {
  const count = problems.length === 1 ? 'a finding' : `${String(problems.length)} findings`;
  return {
    tool,
    rule: INVALID_RULE,
    path: '.',
    identity: INVALID_RULE,
    message: withTroubleshooting(
      `${analyzerName} reported ${count} that nitpicker cannot check, left out of the result; its other findings are kept. First: ${String(problems[0])}`,
      TROUBLESHOOTING_ANCHORS.analyzerCrashed,
    ),
    classification: 'tool-error',
  };
}

function toolOf(finding: unknown, analyzerName: string): string {
  return isRecord(finding) && typeof finding['tool'] === 'string' && finding['tool'] !== ''
    ? finding['tool']
    : analyzerName;
}

function parsedOrProblem(
  finding: unknown,
  {
    context,
    analyzerName,
    problems,
  }: { readonly context: string; readonly analyzerName: string; readonly problems: Problems },
): TrackedFinding[] {
  try {
    return [parseFinding(finding, context)];
  } catch (error) {
    if (!(error instanceof TypeError)) {
      throw error;
    }
    const tool = toolOf(finding, analyzerName);
    problems.set(tool, [...(problems.get(tool) ?? []), error.message]);
    return [];
  }
}

/**
 * The analyzer report `value` like parseAnalyzerReport, with each finding that fails the schema
 * left out and named in one tool error for its tool, so one bad finding does not cost the
 * analyzer's others. The tool error carries the bad finding's tool, so a comparison blocks only on
 * a tool error of the analyzer itself.
 */
export function parseAnalyzerReportKeepingValid(
  value: unknown,
  analyzerName: string,
): ParsedReport {
  if (!(isRecord(value) && Array.isArray(value['findings']))) {
    return parseAnalyzerReport(value, analyzerName);
  }
  const report = parseAnalyzerReport({ ...value, findings: [] }, analyzerName);
  const problems: Problems = new Map();
  const findings = expandMetricEntries(value['findings']).flatMap(
    (finding: unknown, index: number) =>
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
