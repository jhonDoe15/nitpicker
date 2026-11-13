import { absoluteTextReportPath } from '../../diff/reporting/reporters.mts';
import { renderConsoleSummary } from '../../diff/reporting/summary.mts';
import { writeGithubOutput } from '../../diff/reporting/github/emit.mts';
import { renderClosingSections } from '../../exceptions/stale-exceptions.mts';
import { colorEnabled, displayPath } from '../../../shared/messages/terminal/terminal-text.mjs';
import { stagedHeader } from '../../quick/summary.mjs';
import { comparisonExitCode as exitCodeOf } from '../../diff/reporting/failing-tests/failing-tests.mts';
import { comparisonJson } from '../../diff/reporting/json-output/json-output.mts';
import type { TextOutput } from '../../cli-context.mts';
import type { ReportData } from '../../../shared/values/findings.mts';
import { fieldOf, textOf } from '../../../shared/values/readers.mts';

type OutcomeCli = {
  readonly options: {
    readonly details: boolean;
    readonly ruleFilters: readonly string[];
    readonly shardCount?: number | undefined;
    readonly deferExit: boolean;
  };
  readonly stdout: TextOutput;
  readonly stderr: TextOutput;
  readonly environment: NodeJS.ProcessEnv;
  readonly currentProjectRoot: string;
  readonly config: unknown;
  readonly jsonOutput?: TextOutput;
};

type Outcome = {
  readonly cli: OutcomeCli;
  readonly report: ReportData;
  readonly base: { readonly baseRef: unknown; readonly source: unknown };
  readonly outputRoot: string;
};

function isUnchanged(report: unknown): boolean {
  return fieldOf(fieldOf(report, 'summary'), 'noChanges') === true;
}

function consoleSummary({ cli, report, outputRoot }: Omit<Outcome, 'base'>): string {
  const color = colorEnabled(cli.stdout, cli.environment);
  const diagnosticsPath: unknown = displayPath(absoluteTextReportPath(outputRoot));
  return textOf(
    renderConsoleSummary(report, { color, details: cli.options.details, diagnosticsPath }),
  );
}

export function writeComparisonOutcome({ cli, report, base, outputRoot }: Outcome): number {
  const { options, environment, stdout } = cli;
  const unchanged = isUnchanged(report);
  if (cli.jsonOutput === undefined) {
    writeConsoleOutcome({ cli, report, base, outputRoot });
  } else if (!unchanged) {
    stdout.write(textOf(renderClosingSections(cli, report)));
  }
  if (options.shardCount === undefined) {
    writeGithubOutput({
      kind: 'diff',
      report,
      projectRoot: cli.currentProjectRoot,
      environment,
      stdout,
      stderr: cli.stderr,
    });
  }
  const gateExitCode = exitCodeOf(report);
  const exitCode = options.deferExit ? 0 : gateExitCode;
  cli.jsonOutput?.write(
    textOf(comparisonJson({ report, base, outputRoot, gateExitCode, exitCode })),
  );
  return exitCode;
}

function writeConsoleOutcome({ cli, report, base, outputRoot }: Outcome): void {
  const unchanged = isUnchanged(report);
  if (!unchanged) {
    cli.stdout.write(
      `Base: ${textOf(base.baseRef)} (${textOf(base.source)})\n${textOf(stagedHeader(fieldOf(report, 'summary')))}`,
    );
  }
  cli.stdout.write(consoleSummary({ cli, report, outputRoot }));
  if (!unchanged) {
    cli.stdout.write(textOf(renderClosingSections(cli, report)));
  }
}
