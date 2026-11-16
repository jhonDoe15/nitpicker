import path from 'node:path';
import { repositoryRootOf } from '../../configuration/layers/layers.mjs';
import { readLayeredConfig } from '../../configuration/layers/read-layered.mts';
import { enclosingMember } from '../plan/enclosing.mts';
import { baseDeclaresProjects, basePlanOf } from '../policy/base-plan.mts';
import { asProjectLoosenings, projectSetLoosenings } from '../policy/project-set.mts';
import { comparisonBase, toolErrorsOf } from './context.mts';
import { undeclaredHint } from './messages.mjs';
import type { NitpickerConfig } from '../../../shared/values/config-types.mts';
import type { ReportEntry } from '../../../shared/values/findings.mts';
import type { ProjectLoosening } from '../policy/project-set.mts';
import type { Inspection, MonorepoCli, MonorepoPlan, PlanProject } from '../project-types.mts';

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
  const { loosenings, toolErrors } = cli.options.all
    ? { loosenings: [], toolErrors: [] }
    : formerProjectLoosenings({ root: currentProjectRoot, files: inspection.files, cli });
  return { extraCli: { repositoryLoosenings: loosenings, repositoryToolErrors: toolErrors } };
}

export function enclosingPlan(directory: string): Enclosing | undefined {
  const enclosing = enclosingMember(directory);
  const plan = enclosing?.plan;
  return enclosing === undefined || plan === undefined
    ? undefined
    : { plan, files: enclosing.files, member: enclosing.member };
}
