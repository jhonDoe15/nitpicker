import { realpathSync } from 'node:fs';
import { packageVersion } from '../help/package-version.mjs';
import { INIT_USAGE_TEXT } from '../help/usage-text.mts';
import { detectProject } from './detection/detect-project.mjs';
import { appendSnippet, hasSnippet, INSTRUCTION_FILES } from './files/agents-md.mjs';
import {
  APPROVAL_WORKFLOW,
  placeApprovalWorkflow,
  placeWorkflow,
  workflowPath,
} from './files/ci-workflow.mjs';
import { placeConfig } from './files/config-file.mjs';
import { parseInitArguments } from './init-arguments.mts';
import {
  type AgentsResult,
  type Peers,
  type Placed,
  type PlacedFile,
  type Project,
  renderReport,
} from './init-report.mts';
import { planPeers } from './peers/peer-plan.mjs';
import { skillSource } from './skill/skill-source.mjs';
import { assertNothingInTheWay, hasProjectFile } from './support/inside-project.mjs';
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

const projectOf: (projectRoot: string) => Project = detectProject;
const peersOf: (projectRoot: string, project: Project, nodeVersion: string) => Peers = planPeers;
const configOf: (projectRoot: string, preset: string) => PlacedFile = placeConfig;
const workflowOf: (projectRoot: string, context: object) => PlacedFile = placeWorkflow;
const approvalOf: (repository: string) => PlacedFile = placeApprovalWorkflow;
const workflowFileOf: (projectRoot: string, repository: string) => string = workflowPath;
const snippetOf: (projectRoot: string) => AgentsResult = appendSnippet;
const sourceOf: (
  projectRoot: string,
  options: { readonly repository: string; readonly version: unknown },
) => string = skillSource;
const versionOf: () => unknown = packageVersion;
const instructionFiles: readonly string[] = INSTRUCTION_FILES;
const approvalWorkflow: string = APPROVAL_WORKFLOW;

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
  const project = projectOf(projectRoot);
  const peers = peersOf(projectRoot, project, nodeVersion);
  const files = placeFiles(projectRoot, options, { project, peers, repository });
  const source = sourceOf(projectRoot, { repository, version: versionOf() });
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
          [repository, approvalWorkflow],
        ];
  const agentTargets = options.agentsMd
    ? instructionFiles.map((name): Target => [projectRoot, name])
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
  const context = { project, peers, version: versionOf(), repository };
  const workflowFile = workflowFileOf(projectRoot, repository);
  checkTargets(projectRoot, options, { repository, workflowFile });
  return {
    config: configOf(projectRoot, project.preset),
    workflow: options.ci.length === 0 ? undefined : workflowOf(projectRoot, context),
    approval: options.ci.length === 0 ? undefined : approvalOf(repository),
    workflowFile,
    agents: options.agentsMd ? snippetOf(projectRoot) : undefined,
    offers: {
      agents: !(options.agentsMd || hasSnippet(projectRoot)),
      workflow: options.ci.length === 0 && !hasProjectFile(repository, workflowFile),
    },
  };
}
