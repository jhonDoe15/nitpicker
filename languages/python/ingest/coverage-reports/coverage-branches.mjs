import { MINIMUM_BRANCH_COVERAGE } from '../../../../shared/policy.mjs';
import { branchCoverageFindings } from '../../../../shared/rules/branch-coverage.mjs';
import { enclosingFunctionName } from '../../../../shared/rules/finding-helpers.mjs';
import { hashIdentity, normalizeReportPath } from '../../../../shared/ingest/common.mjs';
import { formatAgnosticText } from '../../../../shared/source-text/format-tokens.mjs';

const SCOPE_START = /^(?:async\s+def|def|class)\s+(\w+)/;
const CASE_START = /^case\b/;
const NO_CASE_MATCHED =
  'no case matching (if the cases cover every value, end the match with `case _:` and `assert_never(subject)`)';

export function ingestCoverageBranches(text, options = {}) {
  const report = JSON.parse(text);
  if (typeof report?.files !== 'object' || report.files === null) {
    throw new TypeError('coverage.py JSON report must contain a files object');
  }
  const tool = options.tool ?? 'coverage-py';
  const minimum = options.minimum ?? MINIMUM_BRANCH_COVERAGE;
  const roots = options.roots ?? [undefined];
  const findings = Object.entries(report.files).flatMap(([file, data]) => {
    const filePath = roots
      .map((root) => normalizeReportPath(file, root))
      .find((candidate) => candidate !== undefined);
    const source = filePath === undefined ? undefined : options.sourceText?.(filePath);
    return source === undefined
      ? []
      : fileFindings(data, {
          path: filePath,
          lines: source.split(/\r?\n/),
          tool,
          minimum,
          options,
        });
  });
  return { findings };
}

function fileFindings(data, { path, lines, tool, minimum, options }) {
  const branches = [];
  for (const [line, outcomes] of outcomesByLine(data)) {
    const source = lines[line - 1]?.trim().replaceAll(/\s+/g, ' ');
    if (source === undefined || source === '') {
      continue;
    }
    const text = formatAgnosticText(lines[line - 1], path);
    branches.push({
      path,
      line,
      key: hashIdentity('branch-source', [enclosingScope(lines, line - 1), text]),
      anchor: hashIdentity('branch-source', [text]),
      percent: (outcomes.taken / (outcomes.taken + outcomes.missed.length)) * 100,
      arms: outcomes.missed.map((destination) => describeArm(lines, line, destination)),
      symbol: enclosingFunctionName(options.functions ?? [], path, line),
    });
  }
  return branchCoverageFindings(branches, {
    tool,
    minimum,
    identify: (key, occurrence) => (occurrence === 1 ? key : `${key}#${String(occurrence)}`),
  });
}

function indentOf(text) {
  return text.length - text.trimStart().length;
}

function enclosingScope(lines, index) {
  const names = [];
  let indent = indentOf(lines[index]);
  for (const earlier of lines.slice(0, index).reverse()) {
    if (indent === 0) {
      break;
    }
    const name = SCOPE_START.exec(earlier.trimStart())?.[1];
    if (name !== undefined && indentOf(earlier) < indent) {
      names.unshift(name);
      indent = indentOf(earlier);
    }
  }
  return names.join('.');
}

function outcomesByLine(data) {
  const byLine = new Map();
  for (const [line] of validArcs(data.executed_branches)) {
    outcomesOf(byLine, line).taken += 1;
  }
  for (const [line, destination] of validArcs(data.missing_branches)) {
    outcomesOf(byLine, line).missed.push(destination);
  }
  return [...byLine].sort(([a], [b]) => a - b);
}

function outcomesOf(byLine, line) {
  if (!byLine.has(line)) {
    byLine.set(line, { taken: 0, missed: [] });
  }
  return byLine.get(line);
}

function validArcs(arcs) {
  return (Array.isArray(arcs) ? arcs : []).filter(
    (arc) => Array.isArray(arc) && Number.isInteger(arc[0]) && Number.isInteger(arc[1]),
  );
}

function describeArm(lines, line, destination) {
  if (CASE_START.test(lines[line - 1].trimStart()) && leavesMatch(lines, line, destination)) {
    return NO_CASE_MATCHED;
  }
  return destination > 0
    ? `the branch to line ${String(destination)}`
    : 'the exit from the enclosing scope';
}

function leavesMatch(lines, line, destination) {
  return destination < 0 || indentOf(lines[destination - 1] ?? '') < indentOf(lines[line - 1]);
}
