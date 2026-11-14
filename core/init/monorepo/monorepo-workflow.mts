import { textOf } from '../../../shared/values/readers.mts';
import { workflowParts } from '../files/ci-steps.mts';
import { filledWorkflow, namedParts, workflowPath } from '../files/ci-workflow.mts';
import { placeFile } from '../files/place-file.mts';
import { DETAIL, repositoryPath, yamlScalar } from '../files/workflow/yaml-steps.mts';
import type { PlacedFile } from '../init-report.mts';
import type { InitProject } from '../init-types.mts';
import type { MemberSetup } from './monorepo-files.mts';

type Workflow = {
  readonly root: string;
  readonly repository: string;
  readonly version: unknown;
};

type Steps = {
  readonly environment: readonly string[];
  readonly install: readonly string[];
  readonly notes: readonly string[];
  readonly runDefaults: Readonly<Record<string, unknown>>;
  readonly action?: string;
};

const STEP_START = '      - ';

function blocksOf(lines: readonly string[]): string[] {
  const blocks: string[][] = [];
  for (const line of lines) {
    if (line.startsWith(STEP_START) || blocks.length === 0) {
      blocks.push([line]);
    } else {
      blocks.at(-1)?.push(line);
    }
  }
  return blocks.map((block) => block.join('\n'));
}

function installFolder(setup: MemberSetup, project: InitProject, repository: string): string {
  const folder = project.packageManager?.root ?? setup.member.absolute;
  return repositoryPath(repository, folder);
}

function inFolder(block: string, folder: string): string {
  return folder === ''
    ? block
    : `${block}\n${DETAIL}working-directory: ${String(yamlScalar(folder))}`;
}

function memberSteps(setup: MemberSetup, workflow: Workflow): Steps {
  const { project, peers } = setup;
  if (project === undefined) {
    return { environment: [], install: [], notes: [], runDefaults: {} };
  }
  const context = { project, version: workflow.version, repository: workflow.repository };
  const parts = workflowParts(
    setup.member.absolute,
    peers === undefined ? context : { ...context, peers },
  );
  const folder = installFolder(setup, project, workflow.repository);
  return {
    environment: blocksOf(parts.ENVIRONMENT_STEPS),
    install: blocksOf(parts.INSTALL_STEPS).map((block) => inFolder(block, folder)),
    notes: parts.notes,
    runDefaults: parts.runDefaults,
    action: parts.ACTION,
  };
}

function gateInputs({ root, repository, version }: Workflow): string[] {
  const folder = repositoryPath(repository, root);
  const inputs = {
    ...(folder === '' ? {} : { 'working-directory': folder }),
    package: `nitpicker@${textOf(version)}`,
  };
  return Object.entries(inputs).map(
    ([key, value]) => `${DETAIL}  ${key}: ${String(yamlScalar(value))}`,
  );
}

export function placeMonorepoWorkflow(
  setups: readonly MemberSetup[],
  workflow: Workflow,
): PlacedFile {
  const steps = setups.map((setup) => memberSteps(setup, workflow));
  const unique = (blocks: readonly string[]): string[] =>
    [...new Set(blocks)].flatMap((block) => block.split('\n'));
  const notes = [...new Set(steps.flatMap((step) => step.notes))];
  const content = filledWorkflow({
    ...namedParts(
      workflow.root,
      workflow.repository,
      Object.assign({}, ...steps.map((step) => step.runDefaults)),
    ),
    ENVIRONMENT_STEPS: unique(steps.flatMap((step) => step.environment)),
    INSTALL_STEPS: unique(steps.flatMap((step) => step.install)),
    ACTION: steps.find((step) => step.action !== undefined)?.action,
    GATE_INPUTS: gateInputs(workflow),
  });
  const placed = placeFile({
    root: workflow.repository,
    relative: workflowPath(workflow.root, workflow.repository),
    content,
  });
  return notes.length === 0 ? placed : { ...placed, notes };
}
