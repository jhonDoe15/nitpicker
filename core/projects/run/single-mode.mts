import path from 'node:path';
import { repositoryRootOf } from '../../configuration/layers/layers.mjs';
import { readLayeredConfig } from '../../configuration/layers/read-layered.mjs';
import { enclosingMember } from '../plan/enclosing.mjs';
import { baseDeclaresProjects, basePlanOf } from '../policy/base-plan.mjs';
import { asProjectLoosenings, projectSetLoosenings } from '../policy/project-set.mts';
import { comparisonBase, toolErrorsOf } from './context.mts';
import { undeclaredHint } from './messages.mjs';
import type { NitpickerConfig } from '../../configuration/config-types.mts';
import type { ReportEntry } from '../../../shared/values/findings.mts';
import type { ProjectLoosening } from '../policy/project-set.mts';
import type { MonorepoCli, MonorepoPlan, PlanProject } from '../project-types.mts';

type Loosenings = {
  readonly loosenings: readonly ProjectLoosening[];
  readonly toolErrors: readonly ReportEntry[];
};
type Probe = {
  readonly root: string;
  readonly files: readonly string[];
  readonly cli: MonorepoCli;
};
type Enclosing = {
  readonly plan: MonorepoPlan;
  readonly files: readonly string[];
  readonly member: PlanProject;
};
type Inspection = { readonly undeclared?: readonly unknown[]; readonly files: readonly string[] };

const memberEnclosing: (directory: string) => Partial<Enclosing> | undefined = enclosingMember;
const basePlanAt: (query: {
  readonly repositoryRoot: string;
  readonly prefix: string;
  readonly mergeBaseSha: string;
}) => { readonly plan?: MonorepoPlan; readonly error?: unknown } = basePlanOf;

export function requestsProjects(cli: MonorepoCli): boolean {
  return (cli.options.projectPaths ?? []).length > 0;
}

function configuredBaseOf(root: string): {
  readonly base: string | undefined;
  readonly error?: unknown;
} {
  try {
    const config: NitpickerConfig = readLayeredConfig(root);
    return { base: config.base };
  } catch (error) {
    return { base: undefined, error };
  }
}

function formerAt({ root, files, cli }: Probe, repositoryRoot: string): Loosenings {
  const prefix = path.relative(repositoryRoot, root).split(path.sep).join('/') || '.';
  const configuredBase = configuredBaseOf(root).base;
  const { mergeBaseSha } = comparisonBase({ repositoryRoot, configuredBase, cli });
  if (baseDeclaresProjects({ repositoryRoot, prefix, mergeBaseSha }) !== true) {
    return { loosenings: [], toolErrors: [] };
  }
  const { plan: basePlan, error } = basePlanAt({ repositoryRoot, prefix, mergeBaseSha });
  const loosenings = projectSetLoosenings({
    basePlan,
    headPlan: undefined,
    root,
    headFiles: files,
  });
  return { loosenings: asProjectLoosenings(loosenings, root), toolErrors: toolErrorsOf(error) };
}

function formerProjectLoosenings(probe: Probe): Loosenings {
  try {
    const repositoryRoot: string = repositoryRootOf(probe.root);
    return formerAt(probe, repositoryRoot);
  } catch (error) {
    return { loosenings: [], toolErrors: toolErrorsOf(error) };
  }
}

export function singleMode(
  inspection: Inspection,
  cli: MonorepoCli,
  currentProjectRoot: string,
): { readonly extraCli: object } {
  if (requestsProjects(cli)) {
    throw new Error(
      '--project needs a repository with several projects. ' +
        'List them in "projects" of nitpicker.config.json, or drop --project to check this one project.',
    );
  }
  for (const notice of undeclaredHint(inspection.undeclared ?? [])) {
    cli.stderr.write(`nitpicker: ${notice}\n`);
  }
  const { loosenings, toolErrors } =
    cli.options.all === true
      ? { loosenings: [], toolErrors: [] }
      : formerProjectLoosenings({ root: currentProjectRoot, files: inspection.files, cli });
  return { extraCli: { repositoryLoosenings: loosenings, repositoryToolErrors: toolErrors } };
}

export function enclosingPlan(directory: string): Enclosing | undefined {
  const { plan, files, member } = memberEnclosing(directory) ?? {};
  return plan === undefined || files === undefined || member === undefined
    ? undefined
    : { plan, files, member };
}
