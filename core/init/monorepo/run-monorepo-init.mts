import { packageVersion } from '../../help/package-version.mts';
import { appendSnippet, hasSnippet } from '../files/agents-md.mts';
import { placeApprovalWorkflow, workflowPath } from '../files/ci-workflow.mts';
import { skillSource } from '../skill/skill-source.mts';
import { hasProjectFile } from '../support/inside-project.mts';
import { placeRootConfig, setUpMember } from './monorepo-files.mts';
import { type MonorepoPlaced, renderMonorepoReport } from './monorepo-report.mts';
import { placeMonorepoWorkflow } from './monorepo-workflow.mts';
import type { MonorepoLayout } from './monorepo-layout.mts';

type Request = {
  readonly root: string;
  readonly repository: string;
  readonly nodeVersion: string;
  readonly options: { readonly agentsMd: boolean; readonly ci: readonly string[] };
};

export type MonorepoInit = { readonly text: string; readonly exitCode: number };

function placedFiles(placed: MonorepoPlaced): readonly (object | undefined)[] {
  return [
    placed.rootConfig,
    placed.workflow,
    placed.ci.approval,
    ...placed.setups.map(({ config }) => config),
  ];
}

export function runMonorepoInit(layout: MonorepoLayout, request: Request): MonorepoInit {
  const { root, repository, nodeVersion, options } = request;
  const version = packageVersion();
  const setups = layout.members.map((member) => setUpMember(member, nodeVersion));
  const ci = options.ci.length > 0;
  const workflowFile = workflowPath(root, repository);
  const placed: MonorepoPlaced = {
    layout,
    setups,
    rootConfig: placeRootConfig(root, layout.entries),
    workflow: ci ? placeMonorepoWorkflow(setups, { root, repository, version }) : undefined,
    agents: options.agentsMd ? appendSnippet(root) : undefined,
    ci: {
      approval: ci ? placeApprovalWorkflow(repository) : undefined,
      workflowFile,
      offered: !ci && !hasProjectFile(repository, workflowFile),
    },
    offers: { agents: !(options.agentsMd || hasSnippet(root)) },
    skillSource: skillSource(root, { repository, version }),
  };
  const differs = placedFiles(placed).some(
    (file) => typeof file === 'object' && 'status' in file && file.status === 'differs',
  );
  return { text: renderMonorepoReport(placed), exitCode: differs ? 1 : 0 };
}
