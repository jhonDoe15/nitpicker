import { appendFileSync, existsSync, statSync } from 'node:fs';
import { GitCommandError, runGit } from '../../git/repository/command.mjs';
import { renderDiffSummary } from './diff-summary.mjs';
import { renderSnapshotSummary } from './snapshot-summary.mjs';
import { annotationLines } from './workflow-commands.mjs';
import { withoutSkipNotices } from '../summary.mjs';

function setting(environment, name) {
  const value = environment[name];
  return typeof value === 'string' && value !== '' ? value : undefined;
}

export function githubOutputPlan(environment) {
  const mode = setting(environment, 'NITPICKER_GITHUB_OUTPUT');
  if (mode === 'off') {
    return { summaryPath: undefined, annotate: false };
  }
  return {
    summaryPath: setting(environment, 'GITHUB_STEP_SUMMARY'),
    annotate: mode === 'on' || environment.GITHUB_ACTIONS === 'true',
  };
}

function linkBase(environment) {
  const server = setting(environment, 'GITHUB_SERVER_URL');
  const repository = setting(environment, 'GITHUB_REPOSITORY');
  const sha = setting(environment, 'GITHUB_SHA');
  return server === undefined || repository === undefined || sha === undefined
    ? undefined
    : `${server.replace(/\/+$/u, '')}/${repository}/blob/${sha}`;
}

function projectPrefixOf(projectRoot) {
  try {
    return runGit(projectRoot, ['rev-parse', '--show-prefix']).trim();
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

function closedFences(markdown) {
  const fences = markdown.split('\n').filter((line) => line.startsWith('```')).length;
  return fences % 2 === 0 ? markdown : `${markdown}${FENCE_CLOSE}`;
}

export function fittedSummary(text, usedBytes) {
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

function appendSummary(summaryPath, text) {
  const used = existsSync(summaryPath) ? statSync(summaryPath).size : 0;
  const fitted = fittedSummary(text, used);
  if (fitted !== '') {
    appendFileSync(summaryPath, fitted);
  }
}

const RENDERERS = { diff: renderDiffSummary, snapshot: renderSnapshotSummary };

function findingsOf(kind, report) {
  return kind === 'diff' ? report.newFindings : report.findings;
}

export function writeGithubOutput({
  kind,
  report: original,
  projectRoot,
  environment,
  stdout,
  stderr,
}) {
  const { summaryPath, annotate } = githubOutputPlan(environment);
  if (summaryPath === undefined && !annotate) {
    return;
  }
  const report = { ...original, toolErrors: withoutSkipNotices(original.toolErrors) };
  const context = { linkBase: linkBase(environment), projectPrefix: projectPrefixOf(projectRoot) };
  if (summaryPath !== undefined) {
    try {
      appendSummary(summaryPath, `${RENDERERS[kind](report, context)}\n`);
    } catch (error) {
      stderr.write(
        `nitpicker: could not write the job summary: ${error instanceof Error ? error.message : String(error)}\n`,
      );
    }
  }
  if (annotate) {
    const lines = annotationLines({
      findings: findingsOf(kind, report).filter(
        ({ classification }) => classification === 'enforceable',
      ),
      toolErrors: report.toolErrors,
      projectPrefix: context.projectPrefix,
    });
    if (lines.length > 0) {
      stdout.write(`${lines.join('\n')}\n`);
    }
  }
}
