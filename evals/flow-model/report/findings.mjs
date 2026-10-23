import { parseAnalyzerReport } from '../../../core/diff/comparison/finding-schema.mjs';
import { sha256 } from './canonical.mjs';

const TOOL = 'flow-model';
const IDENTITY_HEX_LENGTH = 16;

function identityOf(...parts) {
  return sha256(parts.join('|')).slice(0, IDENTITY_HEX_LENGTH);
}

function location(item) {
  return item.line > 0 ? { location: { line: item.line, column: item.column } } : {};
}

function violationMessage(violation) {
  const where = `call site ${violation.site}, path ${violation.path}, ${violation.certainty}`;
  const effect = `${violation.contract}: ${violation.callee} for ${violation.entity}`;
  if (violation.kind === 'transition') {
    const move = `from ${violation.from} to ${violation.to}`;
    return `${effect} moves it ${move}, which the transition contract does not allow (${where}).`;
  }
  const required = `a successful ${violation.requires} for it`;
  return `${effect} runs without ${required} earlier on the path (${where}).`;
}

function violationFinding({ file, entry }, violation) {
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

function incompleteFinding({ file, entry }, reason, occurrence) {
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

function summaryFinding({ file, entry }, result) {
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

function occurrenceOf(reasons, index) {
  const { reason, detail } = reasons[index];
  return countBefore(reasons, index, (item) => item.reason === reason && item.detail === detail);
}

function countBefore(items, index, test) {
  return items.slice(0, index).filter(test).length;
}

export function findingsFor(target, result) {
  return [
    summaryFinding(target, result),
    ...result.violations.map((violation) => violationFinding(target, violation)),
    ...result.reasons.map((reason, index) =>
      incompleteFinding(target, reason, occurrenceOf(result.reasons, index)),
    ),
  ];
}

export function parsedFindings(findings) {
  return parseAnalyzerReport({ findings }, TOOL).findings;
}
