import path from 'node:path';
import { areaCounts } from '../format/rule-groups/finding-areas.mjs';
import { foldMutants } from '../format/mutants.mjs';
import { printable } from '../format/text.mjs';
import { heldFindingsOf } from '../report-model.mjs';
import { errorHeadline, withoutSkipNotices } from '../summary.mjs';
import { withHelpUris } from '../../../../shared/reference/store.mjs';
import { withoutExceptionRoute } from '../../../../shared/messages/exception-sentence.mjs';

const STATUS_OF_EXIT_CODE = ['passed', 'failed', 'error'];

export function comparisonJson({ report, base, outputRoot, gateExitCode, exitCode }) {
  return renderJson({
    mode: 'diff',
    modeFields: {
      base: { ref: base.baseRef, source: base.source },
      ...(report.summary.noChanges === true ? { noChanges: true } : {}),
    },
    findings: report.newFindings,
    held: heldFindingsOf(report).length,
    report,
    outputRoot,
    gateExitCode,
    exitCode,
  });
}

export function snapshotJson({ report, outputRoot, exitCode }) {
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
}) {
  const failing = findings.filter(({ classification }) => classification === 'enforceable');
  const partialRun = report.summary.partialRun;
  const output = {
    mode,
    status: STATUS_OF_EXIT_CODE[gateExitCode],
    exitCode,
    ...modeFields,
    counts: {
      failing: failing.length,
      byArea: Object.fromEntries(areaCounts(failing)),
      reportOnly: findings.length - failing.length,
      ...(held === undefined ? {} : { held }),
    },
    findings: withHelpUris(foldMutants(failing)).map(findingEntry),
    toolErrors: withoutSkipNotices(report.toolErrors).map(toolErrorEntry),
    ...(partialRun === undefined
      ? {}
      : { partialRun: { ran: partialRun.ran, skipped: partialRun.skipped } }),
    reports: path.resolve(outputRoot),
  };
  return `${JSON.stringify(output)}\n`;
}

function present(name, value) {
  return value === undefined ? {} : { [name]: value };
}

function findingEntry(finding) {
  const { tool, rule, location, exception, exceptionList } = finding;
  const message = printable(finding.message);
  return {
    tool,
    rule,
    path: finding.path,
    ...present('line', location?.line),
    ...present('column', location?.column),
    message: exception === undefined ? message : withoutExceptionRoute(message),
    ...present('allowedForm', finding.allowedForm),
    ...present('exception', exception),
    ...present('exceptionList', exceptionList === 'exceptions' ? undefined : exceptionList),
    ...present('helpUri', finding.helpUri),
    ...(finding.folded === true ? { folded: true } : {}),
  };
}

function toolErrorEntry(error) {
  const [firstLine] = String(error.message).split('\n');
  const headline = printable(error.rule === undefined ? errorHeadline(error.message) : firstLine);
  return {
    tool: error.tool,
    ...present('snapshot', error.snapshot),
    ...present('rule', error.rule),
    headline: headline === '' ? `${error.tool} failed with no message` : headline,
  };
}
