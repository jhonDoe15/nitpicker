import path from 'node:path';
import { resolveBase } from '../../diff/git/repository/base-ref.mjs';
import { resolveComparison } from '../../diff/git/repository/git.mjs';
import { clearDiffReports } from '../../diff/reporting/reporters.mjs';
import { clearSnapshotReports } from '../../snapshot/reporters.mjs';
import { normalizeProjectPath } from '../../configuration/layers/settings.mjs';
import { combinedSummary, exitCodeOf, writeCombinedReports } from './combined-summary.mjs';
import { projectHeading, renderPlan, renderSummary } from './console.mjs';
import { outcomeOf, reportFolder } from './outcome.mjs';
import { planMonorepo } from './plan.mjs';
import { changedFiles } from '../selection/changed-files.mjs';
import { dependencyGraph } from '../selection/dependencies/graph.mjs';
import { selectProjects } from '../selection/select-projects.mjs';

function outputRootOf(root, options) {
  if (options.outputRoot !== undefined) {
    return path.resolve(root, options.outputRoot);
  }
  return path.join(root, 'reports/quality', options.all ? 'snapshot' : 'diff');
}

function clearReports(reportRoot) {
  clearDiffReports(reportRoot);
  clearSnapshotReports(reportRoot);
}

function changedSinceBase(plan, cli) {
  const base = resolveBase({
    repositoryRoot: plan.repositoryRoot,
    explicitBase: cli.options.baseRef,
    configuredBase: plan.rootConfig.base,
    environment: cli.environment,
  });
  const { mergeBaseSha } = resolveComparison(plan.repositoryRoot, base.baseRef);
  return changedFiles({ repositoryRoot: plan.repositoryRoot, mergeBaseSha });
}

function choose(plan, cli) {
  const { options } = cli;
  const requested = (options.projectPaths ?? []).map(normalizeProjectPath);
  const byChanges = options.all !== true && requested.length === 0;
  return selectProjects({
    projects: plan.projects,
    changed: byChanges ? changedSinceBase(plan, cli) : [],
    graph: byChanges
      ? dependencyGraph(
          plan.root,
          plan.projects.map(({ path: p }) => p),
        )
      : new Map(),
    prefix: plan.prefix,
    requested,
    all: options.all,
  });
}

function runSelected({ project, cli, runProject, reportRoot }) {
  cli.stdout.write(projectHeading(project));
  clearReports(reportRoot);
  try {
    const exitCode = runProject(project, { ...cli.options, outputRoot: reportRoot });
    return outcomeOf({ exitCode, reportRoot });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    cli.stderr.write(`nitpicker failed in ${project.path}: ${message}\n`);
    return outcomeOf({ exitCode: 2, reportRoot, error: message });
  }
}

function runRow(row, context) {
  const reportRoot = path.join(context.outputRoot, reportFolder(row.project.path));
  if (!row.selection.selected) {
    clearReports(reportRoot);
    return row;
  }
  return { ...row, outcome: runSelected({ ...row, ...context, reportRoot }) };
}

function execute({ plan, cli, runProject }) {
  const startedAt = Date.now();
  const outputRoot = outputRootOf(plan.root, cli.options);
  clearReports(outputRoot);
  const { selection, outside } = choose(plan, cli);
  const rows = plan.projects.map((project, index) => ({ project, selection: selection[index] }));
  cli.stdout.write(renderPlan({ plan, rows, outside }));
  const results = rows.map((row) => runRow(row, { cli, runProject, outputRoot }));
  const summary = combinedSummary({ plan, results, outside, elapsedMs: Date.now() - startedAt });
  const text = renderSummary({ summary, summaryPath: path.join(outputRoot, 'summary.json') });
  writeCombinedReports(outputRoot, summary, text);
  cli.stdout.write(text);
  return exitCodeOf(summary.projects, cli.options);
}

function rejectUnsupported(options) {
  if (options.shardCount !== undefined) {
    throw new Error(
      'Sharding splits the analyzers of one project, so it does not apply at the top of a monorepo. ' +
        'Run one CI job per project with --project <path> (repeatable), or run nitpicker inside each project.',
    );
  }
}

export function runMonorepo({ cli, currentProjectRoot, runProject }) {
  if (cli.singleProject === true) {
    return undefined;
  }
  const plan = planMonorepo({ root: currentProjectRoot });
  if (plan === undefined) {
    if ((cli.options.projectPaths ?? []).length > 0) {
      throw new Error(
        '--project needs a repository with several projects. ' +
          'List them in "projects" of nitpicker.config.json, or drop --project to check this one project.',
      );
    }
    return undefined;
  }
  rejectUnsupported(cli.options);
  return execute({ plan, cli, runProject });
}
