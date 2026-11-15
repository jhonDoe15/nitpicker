import { withProject } from '../model/project-model.mts';
import type { Project } from '../typed/project-types.mts';
import type { FixedProject } from './fixture-project.mts';

export function analyzeFixedSources<T>(result: FixedProject, work: (project: Project) => T): T {
  const names = Object.keys(result.tree).filter((name) => name.startsWith('src/'));
  const context = {
    projectRoot: result.projectRoot,
    files: names.map((path) => ({ path })),
    read: (name: string) => result.tree[name],
    accepts: () => true,
  };
  return withProject(context, work);
}
