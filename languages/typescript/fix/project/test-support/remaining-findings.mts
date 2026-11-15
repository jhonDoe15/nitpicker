import { type LintSettings, lintRule } from '../model/lint-rule.mts';
import type { LintMessage } from '../typed/project-types.mts';
import { withProject } from '../typed/project-views.mts';
import type { FixedProject } from './fixture-project.mts';

export function remainingFindings(
  result: FixedProject,
  name: string,
  lint: LintSettings,
  paths: readonly string[] = [name],
): LintMessage[] {
  const context = {
    projectRoot: result.projectRoot,
    files: paths.map((path) => ({ path })),
    read: (file: string) => result.tree[file],
    accepts: () => true,
  };
  return withProject(context, (project) => lintRule(project, name, lint));
}
