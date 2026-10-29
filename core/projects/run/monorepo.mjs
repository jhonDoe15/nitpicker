import path from 'node:path';
import { policyAcceptance } from '../../command/policy-review/policy-acceptance.mjs';
import { clearDiffReports } from '../../diff/reporting/reporters.mjs';
import { clearSnapshotReports } from '../../snapshot/reporters.mjs';
import { repositoryRootOf } from '../../configuration/layers/layers.mjs';
import { readLayeredConfig } from '../../configuration/layers/read-layered.mjs';
import { normalizeProjectPath } from '../../configuration/layers/settings.mjs';
import { enclosingMember } from '../plan/enclosing.mjs';
import { inspectRepository } from '../plan/inspect.mjs';
import { isGitWorkTree, memberProjectOf } from '../plan/member-root.mjs';
import { reportFolder } from '../plan/project-entry.mjs';
import { baseDeclaresProjects, basePlanOf, planInputsChanged } from '../policy/base-plan.mjs';
import {
  asProjectLoosenings,
  projectSetLoosenings,
  projectsToolError,
  repositoryPolicy,
} from '../policy/project-set.mjs';
import { reappearedProjects } from '../policy/reappeared.mjs';
import {
  clearStaleProjectReports,
  writeCombinedMachineReports,
} from '../report/combined-files.mjs';
import { combinedSummary, exitCodeOf, writeCombinedReports } from '../report/combined-summary.mjs';
import { projectHeading, renderPlan, renderSummary } from '../report/console.mjs';
import { outcomeOf } from '../report/outcome.mjs';
import { changedFiles } from '../selection/changed-files.mjs';
import { dependencyGraph } from '../selection/dependencies/graph.mjs';
import { selectProjects } from '../selection/select-projects.mjs';
import {
  analyzersByProject,
  comparisonBase,
  rootConfigFiles,
  unlistedFolders,
} from './context.mjs';
import { shardingMessage, undeclaredHint, unlistedHint } from './messages.mjs';

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

function comparisonOf(plan, cli) {
  if (cli.options.all === true) {
    return { changed: [] };
  }
  const { repositoryRoot } = plan;
  const { base, mergeBaseSha } = comparisonBase({
    repositoryRoot,
    configuredBase: plan.rootConfig.base,
    cli,
  });
  const changed = changedFiles({ repositoryRoot, mergeBaseSha });
  const { plan: basePlan, error } = planInputsChanged({ repositoryRoot, mergeBaseSha, changed })
    ? basePlanOf({ ...plan, mergeBaseSha })
    : { plan };
  return { base, mergeBaseSha, changed, basePlan, toolErrors: toolErrorsOf(error) };
}

function toolErrorsOf(error) {
  return error === undefined ? [] : [projectsToolError(error)];
}

function choose(plan, cli, comparison) {
  const requested = (cli.options.projectPaths ?? []).map(normalizeProjectPath);
  const byChanges = cli.options.all !== true && requested.length === 0;
  const changed = byChanges ? comparison.changed : [];
  const projectPaths = plan.projects.map(({ path: folder }) => folder);
  const { selection, outside } = selectProjects({
    projects: plan.projects,
    changed,
    graph: byChanges ? dependencyGraph(plan.root, projectPaths) : new Map(),
    prefix: plan.prefix,
    requested,
    all: cli.options.all,
    rootConfigFiles: rootConfigFiles(plan),
  });
  return { selection, outside };
}

function withAnalyzers(selection, analyzers) {
  if (analyzers.size === 0) {
    return selection;
  }
  return selection.map((entry) =>
    entry.selected && analyzers.get(entry.path)?.length === 0
      ? { ...entry, selected: false, reason: 'has none of the requested analyzers' }
      : entry,
  );
}

function runSelected({ project, cli, runProject, reportRoot, extras }) {
  cli.stdout.write(projectHeading(project));
  clearReports(reportRoot);
  try {
    const options = { ...cli.options, ...extras.options, outputRoot: reportRoot };
    const exitCode = runProject(options, extras.cli);
    return outcomeOf({ exitCode, reportRoot });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    cli.stderr.write(`nitpicker failed in ${project.path}: ${message}\n`);
    return outcomeOf({ exitCode: 2, reportRoot, error: message });
  }
}

function extrasOf(project, { comparison, analyzers }) {
  const baseProject = comparison.basePlan?.projects.find(
    ({ path: folder }) => folder === project.path,
  );
  return {
    options: analyzers.has(project.path) ? { analyzerNames: analyzers.get(project.path) } : {},
    cli: {
      currentProjectRoot: project.absolute,
      configOverlay: project.overlay,
      singleProject: true,
      sharedBase: comparison.base,
      baseConfigOverlay: baseProject?.overlay,
    },
  };
}

function runRow(row, context) {
  const reportRoot = path.join(context.outputRoot, reportFolder(row.project.path));
  if (!row.selection.selected) {
    clearReports(reportRoot);
    return row;
  }
  const extras = extrasOf(row.project, context);
  return { ...row, outcome: runSelected({ ...row, ...context, reportRoot, extras }) };
}

function noticesOf(plan, changed, cli) {
  const notices = [
    ...undeclaredHint(
      plan.undeclared,
      plan.projects.map(({ path: folder }) => folder),
    ),
    ...unlistedHint(unlistedFolders(plan, changed)),
  ];
  for (const notice of notices) {
    cli.stderr.write(`nitpicker: ${notice}\n`);
  }
  return notices;
}

function headProjectSet({ plan, files, comparison }) {
  return projectSetLoosenings({
    basePlan: comparison.basePlan,
    headPlan: plan,
    root: plan.root,
    headFiles: files,
    reappeared: reappearedProjects({ plan, basePlan: comparison.basePlan, comparison }),
  });
}

function repositoryOf({ plan, files, comparison, cli }) {
  const loosenings = headProjectSet({ plan, files, comparison });
  const { acceptPolicyChange } = policyAcceptance(cli.options, cli.environment, cli.interactive);
  return repositoryPolicy({
    loosenings,
    root: plan.root,
    acceptedDigest: acceptPolicyChange,
    toolErrors: comparison.toolErrors ?? [],
  });
}

function prepare({ plan, cli }) {
  const outputRoot = outputRootOf(plan.root, cli.options);
  const analyzers = analyzersByProject(plan, cli);
  clearStaleProjectReports({ outputRoot, plan, clearReports });
  clearReports(outputRoot);
  const comparison = comparisonOf(plan, cli);
  const { selection, outside } = choose(plan, cli, comparison);
  const chosen = withAnalyzers(selection, analyzers);
  const rows = plan.projects.map((project, index) => ({ project, selection: chosen[index] }));
  return { outputRoot, analyzers, comparison, outside, rows };
}

function finish({ plan, cli, outputRoot, summary, repository }) {
  const text = renderSummary({ summary, summaryPath: path.join(outputRoot, 'summary.json') });
  writeCombinedReports(outputRoot, summary, text);
  writeCombinedMachineReports({ outputRoot, plan, repository });
  cli.stdout.write(text);
  return exitCodeOf(summary, cli.options);
}

function execute({ plan, files, cli, runProject }) {
  const startedAt = Date.now();
  const { outputRoot, analyzers, comparison, outside, rows } = prepare({ plan, cli });
  const notices = noticesOf(plan, comparison.changed, cli);
  cli.stdout.write(renderPlan({ plan, rows, outside }));
  const repository = repositoryOf({ plan, files, comparison, cli });
  const context = { cli, runProject, outputRoot, comparison, analyzers };
  const results = rows.map((row) => runRow(row, context));
  const elapsedMs = Date.now() - startedAt;
  const summary = combinedSummary({ plan, results, outside, notices, repository, elapsedMs });
  return finish({ plan, cli, outputRoot, summary, repository });
}

function formerProjectLoosenings(probe) {
  try {
    return formerAt({ ...probe, repositoryRoot: repositoryRootOf(probe.root) });
  } catch (error) {
    return { loosenings: [], toolErrors: toolErrorsOf(error) };
  }
}

function singleProjectLoosenings({ root, files, cli }) {
  return cli.options.all === true
    ? { loosenings: [], toolErrors: [] }
    : formerProjectLoosenings({ root, files, cli });
}

function configuredBaseOf(root) {
  try {
    return { base: readLayeredConfig(root).base };
  } catch (error) {
    return { base: undefined, error };
  }
}

function formerAt({ root, files, cli, repositoryRoot }) {
  const prefix = path.relative(repositoryRoot, root).split(path.sep).join('/') || '.';
  const configuredBase = configuredBaseOf(root).base;
  const { mergeBaseSha } = comparisonBase({ repositoryRoot, configuredBase, cli });
  if (!baseDeclaresProjects({ repositoryRoot, prefix, mergeBaseSha })) {
    return { loosenings: [], toolErrors: [] };
  }
  const { plan: basePlan, error } = basePlanOf({ repositoryRoot, prefix, mergeBaseSha });
  const loosenings = projectSetLoosenings({
    basePlan,
    headPlan: undefined,
    root,
    headFiles: files,
  });
  return { loosenings: asProjectLoosenings(loosenings, root), toolErrors: toolErrorsOf(error) };
}

function runMember({ plan, files, member, cli, runProject }) {
  const comparison = comparisonOf(plan, cli);
  const extras = extrasOf(member, { comparison, analyzers: new Map() });
  const loosenings = headProjectSet({ plan, files, comparison });
  return runProject(cli.options, {
    ...extras.cli,
    repositoryLoosenings: asProjectLoosenings(loosenings, plan.root),
    repositoryToolErrors: comparison.toolErrors ?? [],
  });
}

function singleMode({ inspection, cli, currentProjectRoot }) {
  if ((cli.options.projectPaths ?? []).length > 0) {
    throw new Error(
      '--project needs a repository with several projects. ' +
        'List them in "projects" of nitpicker.config.json, or drop --project to check this one project.',
    );
  }
  for (const notice of undeclaredHint(inspection.undeclared)) {
    cli.stderr.write(`nitpicker: ${notice}\n`);
  }
  const probe = { root: currentProjectRoot, files: inspection.files, cli };
  const { loosenings, toolErrors } = singleProjectLoosenings(probe);
  return { extraCli: { repositoryLoosenings: loosenings, repositoryToolErrors: toolErrors } };
}

function enclosingRun(cli, currentProjectRoot) {
  return (cli.options.projectPaths ?? []).length === 0
    ? enclosingMember(currentProjectRoot)
    : undefined;
}

export function runMonorepo({ cli, currentProjectRoot, runProject }) {
  if (cli.singleProject === true || !isGitWorkTree(currentProjectRoot)) {
    return {};
  }
  const inspection = inspectRepository({ root: currentProjectRoot });
  const { plan, files } = inspection;
  const enclosing = plan === undefined ? enclosingRun(cli, currentProjectRoot) : undefined;
  if (enclosing !== undefined) {
    return { exitCode: runMember({ ...enclosing, cli, runProject }) };
  }
  if (plan === undefined) {
    return singleMode({ inspection, cli, currentProjectRoot });
  }
  const member =
    cli.currentProjectRoot === undefined ? memberProjectOf(plan, cli.workingDirectory) : undefined;
  if (member !== undefined && (cli.options.projectPaths ?? []).length === 0) {
    return { exitCode: runMember({ plan, files, member, cli, runProject }) };
  }
  if (cli.options.shardCount !== undefined) {
    throw new Error(shardingMessage(plan));
  }
  return { exitCode: execute({ plan, files, cli, runProject }) };
}
