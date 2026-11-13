import { absoluteTextReportPath } from '../../diff/reporting/reporters.mjs';
import { renderConsoleSummary } from '../../diff/reporting/summary.mjs';
import { writeGithubOutput } from '../../diff/reporting/github/emit.mjs';
import { renderClosingSections } from '../../exceptions/stale-exceptions.mts';
import { colorEnabled, displayPath } from '../../../shared/messages/terminal/terminal-text.mjs';
import { stagedHeader } from '../../quick/summary.mjs';
import { comparisonExitCode } from '../../diff/reporting/failing-tests/failing-tests.mjs';
import { comparisonJson } from '../../diff/reporting/json-output/json-output.mjs';
import type { TextOutput } from '../../cli-context.mts';
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
  readonly report: unknown;
  readonly base: { readonly baseRef: unknown; readonly source: unknown };
  readonly outputRoot: string;
};

const exitCodeOf: (report: unknown) => number = comparisonExitCode;

function isUnchanged(report: unknown): boolean {
  const summary = fieldOf(report, 'summary');
  return fieldOf(summary, 'noChanges') === true || fieldOf(summary, 'skippedAll') === true;
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
