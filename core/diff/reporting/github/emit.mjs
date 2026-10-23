import { appendFileSync } from 'node:fs';
import { GitCommandError, runGit } from '../../git/repository/command.mjs';
import { renderDiffSummary } from './diff-summary.mjs';
import { renderSnapshotSummary } from './snapshot-summary.mjs';
import { annotationLines } from './workflow-commands.mjs';
import { TESTS_FAILED_SKIPPED_RULE } from '../../../../shared/rules/finding-helpers.mjs';

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

function isSkipNotice({ rule }) {
  return rule === TESTS_FAILED_SKIPPED_RULE;
}

function skipNoticesLast(toolErrors) {
  return [
    ...toolErrors.filter((error) => !isSkipNotice(error)),
    ...toolErrors.filter(isSkipNotice),
  ];
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
  const report = { ...original, toolErrors: skipNoticesLast(original.toolErrors) };
  const context = { linkBase: linkBase(environment), projectPrefix: projectPrefixOf(projectRoot) };
  if (summaryPath !== undefined) {
    try {
      appendFileSync(summaryPath, `${RENDERERS[kind](report, context)}\n`);
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
