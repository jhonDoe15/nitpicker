import { outputRootFor } from '../../diff/reporting/reporters.mts';
import { enclosingMember } from '../plan/enclosing.mts';
import { undeclaredHint, writeUndeclaredProjects } from './messages.mts';
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
  currentProjectRoot: string,
): { readonly extraCli: object } {
  if (requestsProjects(cli)) {
    throw new Error(
      '--project needs a repository with several projects. ' +
        'List them in "projects" of nitpicker.config.json, or drop --project to check this one project.',
    );
  }
  const undeclared = inspection.undeclared ?? [];
  const outputRoot = outputRootFor(
    currentProjectRoot,
    cli.options.outputRoot,
    cli.options.all ? 'snapshot' : 'diff',
  );
  const listFile = writeUndeclaredProjects(outputRoot, undeclared, currentProjectRoot);
  for (const notice of undeclaredHint(undeclared, ['.'], { listFile })) {
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
