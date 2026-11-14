import { CROSS_TOOL_OVERLAPS } from './pairs.mjs';

function lineKey(finding) {
  const line = finding.location?.line;
  return line === undefined ? undefined : `${finding.path}\0${String(line)}`;
}

function matchesSecondary(finding, { tool, rule, messageStartsWith }) {
  return (
    finding.tool === tool &&
    finding.rule === rule &&
    (messageStartsWith === undefined || finding.message.startsWith(messageStartsWith))
  );
}

function primaryStarts(reports, { tool, rule }) {
  const starts = new Map();
  for (const finding of reports.get(tool)?.findings ?? []) {
    const key = finding.rule === rule ? lineKey(finding) : undefined;
    if (key !== undefined && Number.isInteger(finding.location.column)) {
      starts.set(key, [...(starts.get(key) ?? []), finding.location.column]);
    }
  }
  return starts;
}

function coveredBy(overlaps) {
  return (finding) => {
    const key = lineKey(finding);
    const column = finding.location?.column;
    return (
      key !== undefined &&
      Number.isInteger(column) &&
      overlaps.some(
        ({ secondary, starts }) =>
          matchesSecondary(finding, secondary) &&
          (starts.get(key) ?? []).some((start) => start <= column),
      )
    );
  };
}

export function withoutCrossToolOverlaps(run, pairs = CROSS_TOOL_OVERLAPS) {
  const overlaps = pairs.map(({ primary, secondary }) => ({
    secondary,
    starts: primaryStarts(run.reports, primary),
  }));
  const isCovered = coveredBy(overlaps);
  const reports = new Map(run.reports);
  for (const tool of new Set(pairs.map(({ secondary }) => secondary.tool))) {
    const report = run.reports.get(tool);
    if (report !== undefined && Array.isArray(report.findings)) {
      reports.set(tool, {
        ...report,
        findings: report.findings.filter((finding) => !isCovered(finding)),
      });
    }
  }
  return { ...run, reports };
}

function ran(run, tool) {
  return (
    Array.isArray(run.reports.get(tool)?.findings) &&
    !(run.toolErrors ?? []).some((error) => error.tool === tool)
  );
}

export function withoutSharedCrossToolOverlaps({ baseRun, headRun }, pairs = CROSS_TOOL_OVERLAPS) {
  const shared = pairs.filter(
    ({ primary }) => ran(baseRun, primary.tool) && ran(headRun, primary.tool),
  );
  return {
    baseRun: withoutCrossToolOverlaps(baseRun, shared),
    headRun: withoutCrossToolOverlaps(headRun, shared),
  };
}
