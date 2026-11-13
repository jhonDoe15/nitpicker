import { realpathSync } from 'node:fs';
import { packageVersion } from '../help/package-version.mts';
import { INIT_USAGE_TEXT } from '../help/usage-text.mts';
import { detectProject } from './detection/detect-project.mts';
import { appendSnippet, hasSnippet, INSTRUCTION_FILES } from './files/agents-md.mts';
import {
  APPROVAL_WORKFLOW,
  placeApprovalWorkflow,
  placeWorkflow,
  workflowPath,
} from './files/ci-workflow.mts';
import { placeConfig } from './files/config-file.mts';
import { parseInitArguments } from './init-arguments.mts';
import { type Peers, type Placed, type Project, renderReport } from './init-report.mts';
import { planPeers } from './peers/peer-plan.mts';
import { skillSource } from './skill/skill-source.mts';
import { assertNothingInTheWay, hasProjectFile } from './support/inside-project.mts';
import { assertSupportedNode, requireRepository } from './support/preconditions.mts';
import type { TextOutput } from '../cli-context.mts';

type InitCli = {
  readonly arguments_: readonly string[];
  readonly stdout: TextOutput;
  readonly nodeVersion?: string;
  readonly currentProjectRoot?: string | undefined;
};

type InitOptions = { readonly agentsMd: boolean; readonly ci: readonly string[] };

type Context = { readonly project: Project; readonly peers: Peers; readonly repository: string };

type Target = readonly [root: string, relative: string];

type Targets = { readonly repository: string; readonly workflowFile: string };

export function runInitCommand(cli: InitCli): number {
  const options = parseInitArguments(cli.arguments_);
  if (options.help) {
    cli.stdout.write(INIT_USAGE_TEXT);
    return 0;
  }
  const nodeVersion = cli.nodeVersion ?? process.versions.node;
  assertSupportedNode(nodeVersion);
  const projectRoot = realpathSync(cli.currentProjectRoot ?? process.cwd());
  const repository = requireRepository(projectRoot);
  const project = detectProject(projectRoot);
  const peers = planPeers(projectRoot, project, nodeVersion);
  const files = placeFiles(projectRoot, options, { project, peers, repository });
  const source = skillSource(projectRoot, { repository, version: packageVersion() });
  cli.stdout.write(renderReport({ project, peers, ...files, skillSource: source }));
  const placed = [files.config, files.workflow, files.approval];
  return placed.some((result) => result?.status === 'differs') ? 1 : 0;
}

function checkTargets(
  projectRoot: string,
  options: InitOptions,
  { repository, workflowFile }: Targets,
): void {
  const ciTargets: readonly Target[] =
    options.ci.length === 0
      ? []
      : [
          [repository, workflowFile],
          [repository, APPROVAL_WORKFLOW],
        ];
  const agentTargets = options.agentsMd
    ? INSTRUCTION_FILES.map((name): Target => [projectRoot, name])
    : [];
  const targets = [...ciTargets, ...agentTargets];
  for (const [root, relative] of targets) {
    assertNothingInTheWay(root, relative);
  }
}

function placeFiles(
  projectRoot: string,
  options: InitOptions,
  { project, peers, repository }: Context,
): Omit<Placed, 'project' | 'peers' | 'skillSource'> {
  const context = { project, peers, version: packageVersion(), repository };
  const workflowFile = workflowPath(projectRoot, repository);
  checkTargets(projectRoot, options, { repository, workflowFile });
  return {
    config: placeConfig(projectRoot, project.preset),
    workflow: options.ci.length === 0 ? undefined : placeWorkflow(projectRoot, context),
    approval: options.ci.length === 0 ? undefined : placeApprovalWorkflow(repository),
    workflowFile,
    agents: options.agentsMd ? appendSnippet(projectRoot) : undefined,
    offers: {
      agents: !(options.agentsMd || hasSnippet(projectRoot)),
      workflow: options.ci.length === 0 && !hasProjectFile(repository, workflowFile),
    },
  };
}
