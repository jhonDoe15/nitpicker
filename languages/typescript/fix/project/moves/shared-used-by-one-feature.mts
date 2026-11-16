import path from 'node:path';
import { moduleReferences } from '../model/module-references.mts';
import { withProject } from '../model/project-model.mts';
import type { FixContext, Planned, Project, ProjectRecipe } from '../typed/project-types.mts';
import { planFileMove } from '../typed/project-views.mts';
import {
  fullLayoutOf,
  productionFilter,
  projectGraph,
  recordPlan,
  sharedUsedByOneFeature,
} from '../typed/reuse-views.mts';
import type { FullLayout, PlanResult } from '../typed/reuse-views.mts';

const RULE = { tool: 'coupling', rule: 'shared-used-by-one-feature' };

function productionImporters(layout: FullLayout, project: Project, target: string): string[] {
  return project.names.filter(
    (name) =>
      layout.isSourceFile(name) &&
      moduleReferences(project.sourceFile(name)).some(
        ({ specifier }) => specifier !== undefined && project.resolve(specifier, name) === target,
      ),
  );
}

function planMove({
  context,
  project,
  layout,
  entry,
}: {
  readonly context: FixContext;
  readonly project: Project;
  readonly layout: FullLayout;
  readonly entry: { readonly source: string; readonly directory: string };
}): Planned {
  const outside = productionImporters(layout, project, entry.source).find(
    (importer) => !importer.startsWith(entry.directory),
  );
  if (outside !== undefined) {
    return { declined: `${outside} outside ${entry.directory} imports it` };
  }
  const to = path.posix.join(entry.directory, path.posix.basename(entry.source));
  return planFileMove(context, project, { from: entry.source, to });
}

export const sharedUsedByOneFeatureRecipe: ProjectRecipe = {
  id: 'typescript-shared-used-by-one-feature',
  rules: [RULE],
  presets: ['typescript', 'javascript'],
  scope: 'project',
  safety: 'review',
  plan(context) {
    const layout = fullLayoutOf(context.inputs);
    const changed = new Set(context.files.map(({ path: name }) => name));
    return withProject(context, (project) => {
      const graph = projectGraph(project);
      const result: PlanResult = { fixes: [], notes: [] };
      const entries = layout.sourceRoots.flatMap((sourceRoot: string) =>
        sharedUsedByOneFeature(graph, {
          sourceRoot,
          isProduction: productionFilter(layout, sourceRoot),
        }).filter(({ source }) => changed.has(source)),
      );
      for (const entry of entries) {
        const planned = planMove({ context, project, layout, entry });
        const finding = { ...RULE, path: entry.source, line: 1 };
        recordPlan(result, { planned, finding, rule: RULE.rule });
      }
      return result;
    });
  },
};
