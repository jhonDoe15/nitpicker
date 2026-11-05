import { absoluteTextReportPath } from '../../diff/reporting/reporters.mjs';
import { renderConsoleSummary } from '../../diff/reporting/summary.mjs';
import { writeGithubOutput } from '../../diff/reporting/github/emit.mjs';
import { renderClosingSections } from '../../exceptions/stale-exceptions.mjs';
import { comparisonExitCode } from '../../diff/reporting/failing-tests/failing-tests.mjs';

function consoleSummary({ cli, report, outputRoot }) {
  const color = cli.environment.NO_COLOR === undefined;
  const diagnosticsPath = absoluteTextReportPath(outputRoot);
  return renderConsoleSummary(report, { color, details: cli.options.details, diagnosticsPath });
}

export function writeComparisonOutcome({ cli, report, base, outputRoot }) {
  const { options, environment, stdout } = cli;
  const unchanged = report.summary.noChanges === true;
  if (!unchanged) {
    stdout.write(`Base: ${base.baseRef} (${base.source})\n`);
  }
  stdout.write(consoleSummary({ cli, report, outputRoot }));
  if (!unchanged) {
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
  if (options.deferExit) {
    return 0;
  }
  return comparisonExitCode(report);
}
