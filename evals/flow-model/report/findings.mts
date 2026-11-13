import { parseAnalyzerReport } from '../../../core/diff/comparison/finding-schema.mjs';
import { listOf, requiredFields } from '../../../scripts/json/fields.mts';
import type { AnalysisResult, Reason, ReportedViolation } from '../model/run-types.mts';
import { sha256 } from './canonical.mts';

const TOOL = 'flow-model';
const IDENTITY_HEX_LENGTH = 16;

type Target = { readonly file: string; readonly entry: string };
type Located = { readonly line: number; readonly column: number };

export type Finding = {
  readonly tool: string;
  readonly rule: string;
  readonly path: string;
  readonly identity: string;
  readonly symbol: string;
  readonly message: string;
  readonly classification: 'descriptive';
  readonly location?: Located;
  readonly metric?: { readonly name: string; readonly value: number };
};

function identityOf(...parts: readonly string[]): string {
  return sha256(parts.join('|')).slice(0, IDENTITY_HEX_LENGTH);
}

function location(item: Located): { location?: Located } {
  return item.line > 0 ? { location: { line: item.line, column: item.column } } : {};
}

function violationMessage(violation: ReportedViolation): string {
  const where = `call site ${violation.site}, path ${violation.path}, ${violation.certainty}`;
  const effect = `${violation.contract}: ${violation.callee} for ${violation.entity}`;
  if (violation.kind === 'unmodelled') {
    const region = `unmodelled code (${String(violation.detail)})`;
    return `${violation.contract}: ${violation.callee} may run inside ${region} and break it (${where}).`;
  }
  if (violation.kind === 'transition') {
    const move = `from ${String(violation.from)} to ${String(violation.to)}`;
    return `${effect} moves it ${move}, which the transition contract does not allow (${where}).`;
  }
  const required = `a successful ${String(violation.requires)} for it`;
  return `${effect} runs without ${required} earlier on the path (${where}).`;
}

function violationFinding({ file, entry }: Target, violation: ReportedViolation): Finding {
  return {
    tool: TOOL,
    rule: `${TOOL}/${violation.kind}`,
    path: file,
    identity: identityOf(file, entry, violation.signature),
    symbol: entry,
    message: violationMessage(violation),
    classification: 'descriptive',
    ...location(violation),
  };
}

function incompleteFinding({ file, entry }: Target, reason: Reason, occurrence: number): Finding {
  return {
    tool: TOOL,
    rule: `${TOOL}/incomplete`,
    path: file,
    identity: identityOf(file, entry, reason.reason, reason.detail, String(occurrence)),
    symbol: entry,
    message: `Analysis of ${entry} is incomplete (${reason.reason}: ${reason.detail}); no clean result is claimed.`,
    classification: 'descriptive',
    ...location(reason),
  };
}

function summaryFinding({ file, entry }: Target, result: AnalysisResult): Finding {
  return {
    tool: TOOL,
    rule: `${TOOL}/paths`,
    path: file,
    identity: identityOf(file, entry, 'paths'),
    symbol: entry,
    message: [
      `${entry}: ${result.status} flow model`,
      `paths: ${String(result.paths.length)}`,
      `contract violations: ${String(result.violations.length)}.`,
    ].join(', '),
    classification: 'descriptive',
    metric: { name: 'flow-model-paths', value: result.paths.length },
  };
}

function occurrenceOf(reasons: readonly Reason[], reason: Reason, index: number): number {
  return reasons
    .slice(0, index)
    .filter((item) => item.reason === reason.reason && item.detail === reason.detail).length;
}

export function findingsFor(target: Target, result: AnalysisResult): Finding[] {
  return [
    summaryFinding(target, result),
    ...result.violations.map((violation) => violationFinding(target, violation)),
    ...result.reasons.map((reason, index) =>
      incompleteFinding(target, reason, occurrenceOf(result.reasons, reason, index)),
    ),
  ];
}

export function parsedFindings(findings: readonly Finding[]): readonly unknown[] {
  const report: unknown = parseAnalyzerReport({ findings }, TOOL);
  return listOf(requiredFields(report, 'analyzer report')['findings']);
}
