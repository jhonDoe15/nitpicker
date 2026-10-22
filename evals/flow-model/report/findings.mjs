import { parseAnalyzerReport } from '../../../core/diff/comparison/finding-schema.mjs';
import { sha256 } from './canonical.mjs';

const TOOL = 'flow-model';

function location(item) {
  return item.line > 0 ? { location: { line: item.line, column: item.column } } : {};
}

function violationMessage(violation) {
  const where = `path ${violation.path}, ${violation.certainty}`;
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
    identity: sha256(`${file}|${entry}|${violation.signature}`).slice(0, 16),
    symbol: entry,
    message: violationMessage(violation),
    classification: 'descriptive',
    ...location(violation),
  };
}

function incompleteFinding({ file, entry }, reason) {
  return {
    tool: TOOL,
    rule: `${TOOL}/incomplete`,
    path: file,
    identity: sha256(`${file}|${entry}|${reason.reason}|${reason.detail}`).slice(0, 16),
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
    identity: sha256(`${file}|${entry}|paths`).slice(0, 16),
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

export function findingsFor(target, result) {
  return [
    summaryFinding(target, result),
    ...result.violations.map((violation) => violationFinding(target, violation)),
    ...result.reasons.map((reason) => incompleteFinding(target, reason)),
  ];
}

export function parsedFindings(findings) {
  return parseAnalyzerReport({ findings }, TOOL).findings;
}
