import { enclosingMember } from '../plan/enclosing.mts';
import { undeclaredHint } from './messages.mts';
import type { Inspection, MonorepoCli, MonorepoPlan, PlanProject } from '../project-types.mts';

type Enclosing = {
  readonly plan: MonorepoPlan;
  readonly files: readonly string[];
  readonly member: PlanProject;
};

export function requestsProjects(cli: MonorepoCli): boolean {
  return (cli.options.projectPaths ?? []).length > 0;
}

export function singleMode(
  inspection: Inspection,
  cli: MonorepoCli,
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
  return { extraCli: {} };
}

export function enclosingPlan(directory: string): Enclosing | undefined {
  const enclosing = enclosingMember(directory);
  const plan = enclosing?.plan;
  return enclosing === undefined || plan === undefined
    ? undefined
    : { plan, files: enclosing.files, member: enclosing.member };
}
