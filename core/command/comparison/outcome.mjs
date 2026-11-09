import { absoluteTextReportPath } from '../../diff/reporting/reporters.mjs';
import { renderConsoleSummary } from '../../diff/reporting/summary.mjs';
import { writeGithubOutput } from '../../diff/reporting/github/emit.mjs';
import { renderClosingSections } from '../../exceptions/stale-exceptions.mjs';
import { colorEnabled, displayPath } from '../../../shared/messages/terminal/terminal-text.mjs';
import { stagedHeader } from '../../quick/summary.mjs';
import { comparisonExitCode } from '../../diff/reporting/failing-tests/failing-tests.mjs';
import { comparisonJson } from '../../diff/reporting/json-output/json-output.mjs';

function consoleSummary({ cli, report, outputRoot }) {
  const color = colorEnabled(cli.stdout, cli.environment);
  const diagnosticsPath = displayPath(absoluteTextReportPath(outputRoot));
  return renderConsoleSummary(report, { color, details: cli.options.details, diagnosticsPath });
}

export function writeComparisonOutcome({ cli, report, base, outputRoot }) {
  const { options, environment, stdout } = cli;
  const unchanged = report.summary.noChanges === true;
  if (cli.jsonOutput === undefined) {
    writeConsoleOutcome({ cli, report, base, outputRoot });
  } else if (!unchanged) {
    stdout.write(renderClosingSections(cli, report));
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
  const gateExitCode = comparisonExitCode(report);
  const exitCode = options.deferExit ? 0 : gateExitCode;
  cli.jsonOutput?.write(comparisonJson({ report, base, outputRoot, gateExitCode, exitCode }));
  return exitCode;
}

function writeConsoleOutcome({ cli, report, base, outputRoot }) {
  const unchanged = report.summary.noChanges === true;
  if (!unchanged) {
    cli.stdout.write(`Base: ${base.baseRef} (${base.source})\n${stagedHeader(report.summary)}`);
  }
  cli.stdout.write(consoleSummary({ cli, report, outputRoot }));
  if (!unchanged) {
    cli.stdout.write(renderClosingSections(cli, report));
  }
}
