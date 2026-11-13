import { appendFileSync, existsSync, statSync } from 'node:fs';
import { GitCommandError, runGit } from '../../git/repository/command.mjs';
import { renderDiffSummary } from './diff-summary.mts';
import { renderSnapshotSummary } from './snapshot-summary.mts';
import { annotationLines } from './workflow-commands.mts';
import { withoutSkipNotices } from '../summary.mjs';
import type { LinkContext } from './markdown.mts';
import type { SnapshotSummaryReport } from './snapshot-summary.mts';
import type { ReportData, ReportEntry } from '../../../../shared/values/findings.mts';

type Environment = Readonly<Record<string, string | undefined>>;

type Output = { write(text: string): unknown };

type GithubReport =
  | { readonly kind: 'diff'; readonly report: ReportData }
  | { readonly kind: 'snapshot'; readonly report: SnapshotSummaryReport };

type GithubOutput = GithubReport & {
  readonly projectRoot: string;
  readonly environment: Environment;
  readonly stdout: Output;
  readonly stderr: Output;
};

export type OutputPlan = { readonly summaryPath: string | undefined; readonly annotate: boolean };

const withoutSkips: (toolErrors: readonly ReportEntry[]) => ReportEntry[] = withoutSkipNotices;
const gitOutput: (root: string, args: readonly string[]) => string = runGit;

function setting(environment: Environment, name: string): string | undefined {
  const value = environment[name];
  return typeof value === 'string' && value !== '' ? value : undefined;
}

export function githubOutputPlan(environment: Environment): OutputPlan {
  const mode = setting(environment, 'NITPICKER_GITHUB_OUTPUT');
  if (mode === 'off') {
    return { summaryPath: undefined, annotate: false };
  }
  return {
    summaryPath: setting(environment, 'GITHUB_STEP_SUMMARY'),
    annotate: mode === 'on' || environment['GITHUB_ACTIONS'] === 'true',
  };
}

function linkBase(environment: Environment): string | undefined {
  const server = setting(environment, 'GITHUB_SERVER_URL');
  const repository = setting(environment, 'GITHUB_REPOSITORY');
  const sha = setting(environment, 'GITHUB_SHA');
  return server === undefined || repository === undefined || sha === undefined
    ? undefined
    : `${server.replace(/\/+$/u, '')}/${repository}/blob/${sha}`;
}

function projectPrefixOf(projectRoot: string): string {
  try {
    return gitOutput(projectRoot, ['rev-parse', '--show-prefix']).trim();
  } catch (error) {
    if (error instanceof GitCommandError) {
      return '';
    }
    throw error;
  }
}

export const SUMMARY_LIMIT_BYTES = 1024 * 1024;

const CUT_NOTE =
  '\n\nThe summary is cut here to stay under the 1 MiB limit of GitHub; see `report.txt`.\n';

const FENCE_CLOSE = '\n```';

function closedFences(markdown: string): string {
  const fences = markdown.split('\n').filter((line) => line.startsWith('```')).length;
  return fences % 2 === 0 ? markdown : `${markdown}${FENCE_CLOSE}`;
}

export function fittedSummary(text: string, usedBytes: number): string {
  const budget =
    SUMMARY_LIMIT_BYTES - usedBytes - Buffer.byteLength(CUT_NOTE) - Buffer.byteLength(FENCE_CLOSE);
  if (Buffer.byteLength(text) + usedBytes <= SUMMARY_LIMIT_BYTES) {
    return text;
  }
  if (budget <= 0) {
    return '';
  }
  const kept = Buffer.from(text).subarray(0, budget).toString('utf8');
  return `${closedFences(kept.slice(0, Math.max(kept.lastIndexOf('\n'), 0)))}${CUT_NOTE}`;
}

function appendSummary(summaryPath: string, text: string): void {
  const used = existsSync(summaryPath) ? statSync(summaryPath).size : 0;
  const fitted = fittedSummary(text, used);
  if (fitted !== '') {
    appendFileSync(summaryPath, fitted);
  }
}

function renderSummary(
  output: GithubReport,
  toolErrors: readonly ReportEntry[],
  context: LinkContext,
): string {
  return output.kind === 'diff'
    ? renderDiffSummary({ ...output.report, toolErrors }, context)
    : renderSnapshotSummary({ ...output.report, toolErrors }, context);
}

function findingsOf(output: GithubReport): readonly ReportEntry[] {
  return output.kind === 'diff' ? output.report.newFindings : output.report.findings;
}

export function writeGithubOutput(output: GithubOutput): void {
  const { projectRoot, environment, stdout, stderr } = output;
  const { summaryPath, annotate } = githubOutputPlan(environment);
  if (summaryPath === undefined && !annotate) {
    return;
  }
  const toolErrors = withoutSkips(output.report.toolErrors);
  const context = { linkBase: linkBase(environment), projectPrefix: projectPrefixOf(projectRoot) };
  if (summaryPath !== undefined) {
    try {
      appendSummary(summaryPath, `${renderSummary(output, toolErrors, context)}\n`);
    } catch (error) {
      stderr.write(
        `nitpicker: could not write the job summary: ${error instanceof Error ? error.message : String(error)}\n`,
      );
    }
  }
  if (annotate) {
    const lines = annotationLines({
      findings: findingsOf(output).filter(({ classification }) => classification === 'enforceable'),
      toolErrors,
      projectPrefix: context.projectPrefix,
    });
    if (lines.length > 0) {
      stdout.write(`${lines.join('\n')}\n`);
    }
  }
}
