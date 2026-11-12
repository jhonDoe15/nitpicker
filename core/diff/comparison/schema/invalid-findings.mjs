import { parseAnalyzerReport, parseFinding } from '../finding-schema.mjs';
import { isRecord } from './values.mjs';
import {
  TROUBLESHOOTING_ANCHORS,
  withTroubleshooting,
} from '../../../../shared/messages/troubleshooting.mjs';

const INVALID_RULE = 'invalid-finding';

function invalidFindingsError(tool, analyzerName, problems) {
  const count = problems.length === 1 ? 'a finding' : `${String(problems.length)} findings`;
  return {
    tool,
    rule: INVALID_RULE,
    path: '.',
    identity: INVALID_RULE,
    message: withTroubleshooting(
      `${analyzerName} reported ${count} that nitpicker cannot check, left out of the result; its other findings are kept. First: ${problems[0]}`,
      TROUBLESHOOTING_ANCHORS.analyzerCrashed,
    ),
    classification: 'tool-error',
  };
}

function toolOf(finding, analyzerName) {
  return isRecord(finding) && typeof finding.tool === 'string' && finding.tool !== ''
    ? finding.tool
    : analyzerName;
}

function parsedOrProblem(finding, { context, analyzerName, problems }) {
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
export function parseAnalyzerReportKeepingValid(value, analyzerName) {
  if (!(isRecord(value) && Array.isArray(value.findings))) {
    return parseAnalyzerReport(value, analyzerName);
  }
  const report = parseAnalyzerReport({ ...value, findings: [] }, analyzerName);
  const problems = new Map();
  const findings = value.findings.flatMap((finding, index) =>
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
