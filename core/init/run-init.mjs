import { realpathSync } from 'node:fs';
import { packageVersion } from '../help/package-version.mjs';
import { INIT_USAGE_TEXT } from '../help/usage-text.mjs';
import { detectProject } from './detection/detect-project.mjs';
import { appendSnippet } from './files/agents-md.mjs';
import { placeWorkflow } from './files/ci-workflow.mjs';
import { placeConfig } from './files/config-file.mjs';
import { parseInitArguments } from './init-arguments.mjs';
import { renderReport } from './init-report.mjs';
import { planPeers } from './peers/peer-plan.mjs';

export function runInitCommand(cli) {
  const options = parseInitArguments(cli.arguments_);
  if (options.help) {
    cli.stdout.write(INIT_USAGE_TEXT);
    return 0;
  }
  const projectRoot = realpathSync(cli.currentProjectRoot ?? process.cwd());
  const project = detectProject(projectRoot);
  const peers = planPeers(projectRoot, project);
  const config = placeConfig(projectRoot, project.preset);
  const workflow =
    options.ci.length === 0
      ? undefined
      : placeWorkflow(projectRoot, { project, missing: peers.missing, version: packageVersion() });
  const agents = options.agentsMd ? appendSnippet(projectRoot) : undefined;
  cli.stdout.write(renderReport({ project, peers, config, workflow, agents }));
  return [config, workflow].some((result) => result?.status === 'differs') ? 1 : 0;
}
