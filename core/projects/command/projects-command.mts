import { realpathSync } from 'node:fs';
import { resolveProjectRoot } from '../../configuration/project-checks/project-root.mjs';
import { readLayeredConfig } from '../../configuration/layers/read-layered.mjs';
import { inspectRepository } from '../plan/inspect.mjs';
import { isGitWorkTree } from '../plan/member-root.mjs';
import { selectionOf } from '../run/selection-plan.mts';
import { enclosingPlan } from '../run/single-mode.mts';
import {
  parseProjectsArguments,
  projectsHelp,
  type ProjectsOptions,
} from './projects-arguments.mts';
import { listingJson, listingText, type Listing } from './projects-listing.mts';
import type { TextOutput } from '../../cli-context.mts';
import type { NitpickerConfig } from '../../configuration/config-types.mts';
import type { MonorepoPlan } from '../project-types.mts';

type ProjectsCli = {
  readonly arguments_: readonly string[];
  readonly currentProjectRoot?: string | undefined;
  readonly workingDirectory?: string | undefined;
  readonly environment: NodeJS.ProcessEnv;
  readonly stdout: TextOutput;
};

const inspect: (query: { readonly root: string; readonly repositoryRoot: string | undefined }) => {
  readonly plan?: MonorepoPlan;
} = inspectRepository;

function rootOf(cli: ProjectsCli): string {
  return cli.currentProjectRoot === undefined
    ? resolveProjectRoot(cli.workingDirectory)
    : realpathSync(cli.currentProjectRoot);
}

function planAt(root: string): MonorepoPlan | undefined {
  if (isGitWorkTree(root) !== true) {
    return undefined;
  }
  return inspect({ root, repositoryRoot: undefined }).plan ?? enclosingPlan(root)?.plan;
}

function singleListing(root: string, options: ProjectsOptions): Listing {
  if (options.projectPaths.length > 0) {
    throw new Error(
      '--project needs a repository with several projects. ' +
        'List them in "projects" of nitpicker.config.json, or drop --project.',
    );
  }
  const config: NitpickerConfig = readLayeredConfig(root);
  const preset = config.preset ?? 'typescript';
  return {
    source: 'single',
    selectedBy: options.all ? '--all' : 'a run in a repository of one project',
    projects: [
      { path: '.', preset, origin: 'one project', selected: true, reason: 'the only project' },
    ],
    outside: [],
  };
}

function monorepoListing(plan: MonorepoPlan, options: ProjectsOptions, cli: ProjectsCli): Listing {
  const { comparison, rows, outside } = selectionOf(plan, {
    options,
    environment: cli.environment,
  });
  return {
    source: plan.source,
    selectedBy: selectedBy(options, comparison.base?.baseRef),
    projects: rows.map(({ project, selection }) => ({
      path: project.path,
      preset: project.preset,
      origin: String(project.origin),
      selected: selection.selected,
      reason: selection.reason ?? '',
    })),
    outside,
  };
}

function selectedBy(options: ProjectsOptions, baseRef: string | undefined): string {
  if (options.projectPaths.length > 0) {
    return '--project';
  }
  return options.all ? '--all' : `the change against ${baseRef ?? 'the base'}`;
}

export function runProjectsCommand(cli: ProjectsCli): number {
  const options = parseProjectsArguments(cli.arguments_);
  if (options.help) {
    cli.stdout.write(projectsHelp());
    return 0;
  }
  const root = rootOf(cli);
  const plan = planAt(root);
  const listing =
    plan === undefined ? singleListing(root, options) : monorepoListing(plan, options, cli);
  cli.stdout.write(options.json ? listingJson(listing) : listingText(listing));
  return 0;
}
