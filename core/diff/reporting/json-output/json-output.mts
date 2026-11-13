import path from 'node:path';
import { areaCounts } from '../format/rule-groups/finding-areas.mjs';
import { foldMutants } from '../format/mutants.mjs';
import { printable } from '../format/text.mjs';
import { heldFindingsOf } from '../report-model.mjs';
import { errorHeadline, withoutSkipNotices } from '../summary.mjs';
import { withHelpUris } from '../../../../shared/reference/store.mjs';
import { withoutExceptionRoute } from '../../../../shared/messages/exception-sentence.mjs';
import type { ReportData, ReportEntry } from '../../../../shared/values/findings.mts';
import { fieldOf, textOf } from '../../../../shared/values/readers.mts';

type JsonReport = { readonly summary: unknown; readonly toolErrors: readonly ReportEntry[] };

type ComparisonJson = {
  readonly report: ReportData;
  readonly base: { readonly baseRef: unknown; readonly source: unknown };
  readonly outputRoot: string;
  readonly gateExitCode: number;
  readonly exitCode: number;
};

type SnapshotJson = {
  readonly report: JsonReport & { readonly findings: readonly ReportEntry[] };
  readonly outputRoot: string;
  readonly exitCode: number;
};

type JsonRequest = {
  readonly mode: string;
  readonly modeFields: object;
  readonly findings: readonly ReportEntry[];
  readonly held?: number;
  readonly report: JsonReport;
  readonly outputRoot: string;
  readonly gateExitCode: number;
  readonly exitCode: number;
};

const countsByArea: (findings: readonly ReportEntry[]) => ReadonlyMap<unknown, unknown> =
  areaCounts;
const folded: (findings: readonly ReportEntry[]) => ReportEntry[] = foldMutants;
const printed: (value: unknown) => string = printable;
const heldFindings: (report: ReportData) => readonly ReportEntry[] = heldFindingsOf;
const headlineOf: (message: unknown) => string = errorHeadline;
const withoutSkips: (toolErrors: readonly ReportEntry[]) => ReportEntry[] = withoutSkipNotices;
const helpUris: (findings: readonly ReportEntry[]) => ReportEntry[] = withHelpUris;
const withoutRoute: (message: string) => string = withoutExceptionRoute;

const STATUS_OF_EXIT_CODE = ['passed', 'failed', 'error'];

export function comparisonJson({
  report,
  base,
  outputRoot,
  gateExitCode,
  exitCode,
}: ComparisonJson): string {
  return renderJson({
    mode: 'diff',
    modeFields: {
      base: { ref: base.baseRef, source: base.source },
      ...(report.summary['noChanges'] === true ? { noChanges: true } : {}),
    },
    findings: report.newFindings,
    held: heldFindings(report).length,
    report,
    outputRoot,
    gateExitCode,
    exitCode,
  });
}

export function snapshotJson({ report, outputRoot, exitCode }: SnapshotJson): string {
  return renderJson({
    mode: 'all',
    modeFields: {},
    findings: report.findings,
    report,
    outputRoot,
    gateExitCode: exitCode,
    exitCode,
  });
}

function renderJson({
  mode,
  modeFields,
  findings,
  held,
  report,
  outputRoot,
  gateExitCode,
  exitCode,
}: JsonRequest): string {
  const failing = findings.filter(({ classification }) => classification === 'enforceable');
  const partialRun = fieldOf(report.summary, 'partialRun');
  const output = {
    mode,
    status: STATUS_OF_EXIT_CODE[gateExitCode],
    exitCode,
    ...modeFields,
    counts: {
      failing: failing.length,
      byArea: Object.fromEntries(
        [...countsByArea(failing)].map(([area, count]) => [textOf(area), count]),
      ),
      reportOnly: findings.length - failing.length,
      ...(held === undefined ? {} : { held }),
    },
    findings: helpUris(folded(failing)).map(findingEntry),
    toolErrors: withoutSkips(report.toolErrors).map(toolErrorEntry),
    ...(partialRun === undefined
      ? {}
      : {
          partialRun: {
            ran: fieldOf(partialRun, 'ran'),
            skipped: fieldOf(partialRun, 'skipped'),
          },
        }),
    reports: path.resolve(outputRoot),
  };
  return `${JSON.stringify(output)}\n`;
}

function present(name: string, value: unknown): object {
  return value === undefined ? {} : { [name]: value };
}

function findingEntry(finding: ReportEntry): object {
  const { tool, rule, location, exception, exceptionList } = finding;
  const message = printed(finding.message);
  return {
    tool,
    rule,
    path: finding.path,
    ...present('line', fieldOf(location, 'line')),
    ...present('column', fieldOf(location, 'column')),
    message: exception === undefined ? message : withoutRoute(message),
    ...present('allowedForm', finding['allowedForm']),
    ...present('exception', exception),
    ...present('exceptionList', exceptionList === 'exceptions' ? undefined : exceptionList),
    ...present('helpUri', finding['helpUri']),
    ...(finding['folded'] === true ? { folded: true } : {}),
  };
}

function toolErrorEntry(error: ReportEntry): object {
  const [firstLine] = String(error.message).split('\n');
  const headline = printed(error.rule === undefined ? headlineOf(error.message) : firstLine);
  return {
    tool: error.tool,
    ...present('snapshot', error.snapshot),
    ...present('rule', error.rule),
    headline: headline === '' ? `${textOf(error.tool)} failed with no message` : headline,
  };
}
