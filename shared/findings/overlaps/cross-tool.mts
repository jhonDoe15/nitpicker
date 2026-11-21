import { CROSS_TOOL_OVERLAPS, type Overlap } from './pairs.mts';

type CrossFinding = {
  readonly tool: string;
  readonly rule: string;
  readonly path: string;
  readonly message: string;
  readonly location?: { readonly line?: number; readonly column?: number } | undefined;
};
type Report = { readonly findings?: readonly CrossFinding[] };
type CrossToolRun = {
  readonly reports: ReadonlyMap<string, Report>;
  readonly toolErrors?: readonly { readonly tool?: unknown }[];
};
type Start = { readonly tool: string; readonly rule: string };
type Secondary = Start & { readonly messageStartsWith?: string };
type Covering = { readonly secondary: Secondary; readonly starts: ReadonlyMap<string, number[]> };

function lineKey(finding: CrossFinding): string | undefined {
  const line = finding.location?.line;
  return line === undefined ? undefined : `${finding.path}\0${String(line)}`;
}

function matchesSecondary(
  finding: CrossFinding,
  { tool, rule, messageStartsWith }: Secondary,
): boolean {
  return (
    finding.tool === tool &&
    finding.rule === rule &&
    (messageStartsWith === undefined || finding.message.startsWith(messageStartsWith))
  );
}

function primaryStarts(
  reports: ReadonlyMap<string, Report>,
  { tool, rule }: Start,
): Map<string, number[]> {
  const starts = new Map<string, number[]>();
  for (const finding of reports.get(tool)?.findings ?? []) {
    const key = finding.rule === rule ? lineKey(finding) : undefined;
    const column = finding.location?.column;
    if (key !== undefined && column !== undefined && Number.isInteger(column)) {
      starts.set(key, [...(starts.get(key) ?? []), column]);
    }
  }
  return starts;
}

function coveredBy(overlaps: readonly Covering[]): (finding: CrossFinding) => boolean {
  return (finding: CrossFinding) => {
    const key = lineKey(finding);
    const column = finding.location?.column;
    return (
      key !== undefined &&
      column !== undefined &&
      Number.isInteger(column) &&
      overlaps.some(
        ({ secondary, starts }) =>
          matchesSecondary(finding, secondary) &&
          (starts.get(key) ?? []).some((start) => start <= column),
      )
    );
  };
}

function hasFindings(
  report: Report | undefined,
): report is Report & { readonly findings: readonly CrossFinding[] } {
  return Array.isArray(report?.findings);
}

export function withoutCrossToolOverlaps<Run extends CrossToolRun>(
  run: Run,
  pairs: readonly Overlap[] = CROSS_TOOL_OVERLAPS,
): Run {
  const overlaps = pairs.map(({ primary, secondary }) => ({
    secondary,
    starts: primaryStarts(run.reports, primary),
  }));
  const isCovered = coveredBy(overlaps);
  const reports = new Map<string, Report>(run.reports);
  for (const tool of new Set(pairs.map(({ secondary }) => secondary.tool))) {
    const report = run.reports.get(tool);
    if (hasFindings(report)) {
      reports.set(tool, {
        ...report,
        findings: report.findings.filter((finding) => !isCovered(finding)),
      });
    }
  }
  return { ...run, reports };
}

function ran(run: CrossToolRun, tool: string): boolean {
  return (
    Array.isArray(run.reports.get(tool)?.findings) &&
    !(run.toolErrors ?? []).some((error) => error.tool === tool)
  );
}

export function withoutSharedCrossToolOverlaps<Run extends CrossToolRun>(
  { baseRun, headRun }: { readonly baseRun: Run; readonly headRun: Run },
  pairs: readonly Overlap[] = CROSS_TOOL_OVERLAPS,
): { baseRun: Run; headRun: Run } {
  const shared = pairs.filter(
    ({ primary }) => ran(baseRun, primary.tool) && ran(headRun, primary.tool),
  );
  return {
    baseRun: withoutCrossToolOverlaps(baseRun, shared),
    headRun: withoutCrossToolOverlaps(headRun, shared),
  };
}
