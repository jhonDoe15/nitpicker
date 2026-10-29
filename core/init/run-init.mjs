import { realpathSync } from 'node:fs';
import { packageVersion } from '../help/package-version.mjs';
import { INIT_USAGE_TEXT } from '../help/usage-text.mjs';
import { detectProject } from './detection/detect-project.mjs';
import { appendSnippet, hasSnippet, INSTRUCTION_FILES } from './files/agents-md.mjs';
import { placeWorkflow, workflowPath } from './files/ci-workflow.mjs';
import { placeConfig } from './files/config-file.mjs';
import { parseInitArguments } from './init-arguments.mjs';
import { renderReport } from './init-report.mjs';
import { planPeers } from './peers/peer-plan.mjs';
import { assertNothingInTheWay, hasProjectFile } from './support/inside-project.mjs';
import { assertSupportedNode, requireRepository } from './support/preconditions.mjs';

export function runInitCommand(cli) {
  const options = parseInitArguments(cli.arguments_);
  if (options.help) {
    cli.stdout.write(INIT_USAGE_TEXT);
    return 0;
  }
  assertSupportedNode(cli.nodeVersion ?? process.versions.node);
  const projectRoot = realpathSync(cli.currentProjectRoot ?? process.cwd());
  const repository = requireRepository(projectRoot);
  const project = detectProject(projectRoot);
  const peers = planPeers(projectRoot, project);
  const files = placeFiles(projectRoot, options, { project, peers, repository });
  cli.stdout.write(renderReport({ project, peers, ...files }));
  return [files.config, files.workflow].some((result) => result?.status === 'differs') ? 1 : 0;
}

function checkTargets(projectRoot, options, { repository, workflowFile }) {
  const targets = [
    ...(options.ci.length === 0 ? [] : [[repository, workflowFile]]),
    ...(options.agentsMd ? INSTRUCTION_FILES.map((name) => [projectRoot, name]) : []),
  ];
  for (const [root, relative] of targets) {
    assertNothingInTheWay(root, relative);
  }
}

function placeFiles(projectRoot, options, { project, peers, repository }) {
  const context = { project, peers, version: packageVersion(), repository };
  const workflowFile = workflowPath(projectRoot, repository);
  checkTargets(projectRoot, options, { repository, workflowFile });
  return {
    config: placeConfig(projectRoot, project.preset),
    workflow: options.ci.length === 0 ? undefined : placeWorkflow(projectRoot, context),
    workflowFile,
    agents: options.agentsMd ? appendSnippet(projectRoot) : undefined,
    offers: {
      agents: !options.agentsMd && !hasSnippet(projectRoot),
      workflow: options.ci.length === 0 && !hasProjectFile(repository, workflowFile),
    },
  };
}
