import { realpathSync } from 'node:fs';
import path from 'node:path';
import { resolveProjectRoot as untypedResolveProjectRoot } from '../../configuration/project-checks/project-root.mjs';
import {
  renderConsoleSummary as untypedDiffConsole,
  renderSnapshotConsole as untypedSnapshotConsole,
} from '../../diff/reporting/summary.mjs';
import { workingTreeDigest as untypedDigest } from '../../diff/reporting/run-stamp/run-stamp.mjs';
import {
  colorEnabled as untypedColorEnabled,
  displayPath as untypedDisplayPath,
} from '../../../shared/messages/terminal/terminal-text.mjs';
import type { TextOutput } from '../../cli-context.mts';
import { fieldOf, textOf } from '../../../shared/values/readers.mts';
import { type ShowOptions, SHOW_USAGE, parseShowArguments } from './show-arguments.mts';
import { type LoadedReport, loadReport, locateReport, runFailed } from './show-reports.mts';
import { filterReport, filtersLine, matchesAny } from './show-filters.mts';

const displayPath: (absolutePath: string) => string = untypedDisplayPath;
const colorEnabled: (stream: unknown, environment: NodeJS.ProcessEnv) => boolean =
  untypedColorEnabled;

type ShowCli = {
  readonly arguments_: readonly string[];
  readonly currentProjectRoot?: string | undefined;
  readonly workingDirectory?: string | undefined;
  readonly environment: NodeJS.ProcessEnv;
  readonly stdout: TextOutput;
  readonly stderr: TextOutput;
};

const SHORT_SHA_LENGTH = 12;
const NO_REPORT_EXIT = 2;
const resolveProjectRoot: () => string = untypedResolveProjectRoot;
const digestOf: (
  projectRoot: string,
  outputRoot: string,
) => { readonly kind: string; readonly value?: string } = untypedDigest;
const diffConsole: (report: object, options: object) => string = untypedDiffConsole;
const snapshotConsole: (report: object, options: object) => string = untypedSnapshotConsole;

const SHOW_HELP_TEXT =
  `${SHOW_USAGE}\n\n` +
  'Prints the summary of the last run again, without running any analyzer: the comparison in\n' +
  'reports/quality/diff/, or the --all run in reports/quality/snapshot/ with --all (or when there\n' +
  'is no comparison). --rule, --path and --details work as they do for a run. A warning says when\n' +
  'the working tree changed since that run.\n\n' +
  'Exit codes: 0 when the run passed; 1 when it had new enforceable findings, failing tests or a\n' +
  'tool error; 2 when there is no report to show (run nitpicker first).\n';

function shortSha(value: unknown): string {
  return typeof value === 'string' ? value.slice(0, SHORT_SHA_LENGTH) : '';
}

function headerLine(report: LoadedReport): string {
  const { summary } = report;
  const head = shortSha(fieldOf(summary, 'headSha'));
  const time = fieldOf(summary, 'generatedAt');
  const parts = [
    ...(report.kind === 'diff' ? [`base ${textOf(fieldOf(summary, 'requestedBaseRef'))}`] : []),
    ...(head === '' ? [] : [`head ${head}`]),
    ...(typeof time === 'string' ? [`run at ${time}`] : []),
  ];
  const what = report.kind === 'diff' ? 'the last comparison' : 'the last --all run';
  return `Showing ${what}${parts.length === 0 ? '' : `: ${parts.join(', ')}`}\n`;
}

function staleWarning(report: LoadedReport, projectRoot: string): string {
  const recorded = fieldOf(report.summary, 'workingTree');
  if (typeof recorded !== 'string') {
    return '';
  }
  const current = digestOf(projectRoot, report.outputRoot);
  return current.kind !== 'digest' || current.value === recorded
    ? ''
    : 'Warning: the working tree changed since this run, so these results may be out of date. Run nitpicker again.\n';
}

function rendered(
  report: LoadedReport,
  options: ShowOptions,
  context: { readonly color: boolean; readonly projectRoot: string },
): string {
  const diagnosticsPath = displayPath(path.join(report.outputRoot, 'report.txt'));
  const common = { color: context.color, details: options.details, diagnosticsPath };
  const projectRoot = context.projectRoot;
  if (report.kind === 'snapshot') {
    return snapshotConsole(
      { summary: report.summary, findings: report.findings, toolErrors: report.toolErrors },
      { ...common, projectRoot },
    );
  }
  return diffConsole(
    {
      summary: report.summary,
      newFindings: report.findings,
      unchangedFindings: report.held,
      resolvedFindings: [],
      changedMetrics: [],
      toolErrors: report.toolErrors,
      notes: report.notes,
    },
    { ...common, projectRoot },
  );
}

function writeReport(
  cli: ShowCli,
  report: LoadedReport,
  context: { readonly options: ShowOptions; readonly projectRoot: string },
): void {
  const { stdout } = cli;
  const { options, projectRoot } = context;
  const filters = { ...options, projectRoot, workingDirectory: cli.workingDirectory };
  const shown = filterReport(report, filters);
  stdout.write(headerLine(report));
  stdout.write(staleWarning(report, projectRoot));
  const filterLine = filtersLine(options);
  if (filterLine !== '') {
    stdout.write(filterLine);
  }
  stdout.write(
    filterLine !== '' && !matchesAny(shown)
      ? 'No findings match the filters.\n'
      : rendered(shown, options, { color: colorEnabled(stdout, cli.environment), projectRoot }),
  );
}

function currentRoot(cli: ShowCli): string {
  return textOf(
    cli.currentProjectRoot === undefined
      ? resolveProjectRoot()
      : realpathSync(cli.currentProjectRoot),
  );
}

export function runShowCommand(cli: ShowCli): number {
  if (cli.arguments_.includes('--help')) {
    cli.stdout.write(SHOW_HELP_TEXT);
    return 0;
  }
  const options = parseShowArguments(cli.arguments_);
  const projectRoot = currentRoot(cli);
  const location = locateReport(projectRoot, options);
  const report = loadReport(location);
  if (report === undefined) {
    cli.stderr.write(
      `nitpicker show: no report in ${displayPath(location.outputRoot)}. Run nitpicker first.\n`,
    );
    return NO_REPORT_EXIT;
  }
  writeReport(cli, report, { options, projectRoot });
  return runFailed(report) ? 1 : 0;
}
