import path from 'node:path';
import { sharedUsedByOneFeature } from '../../../preset/coupling/shared-usage.mjs';
import { isReuseProductionPath } from '../../../preset/structure/reuse/reuse-paths.mjs';
import { planFileMove } from '../edits/file-move.mjs';
import { moduleReferences } from '../model/module-references.mjs';
import { layoutOf, withProject } from '../model/project-model.mjs';
import { projectGraph } from '../model/project-graph.mjs';

const RULE = { tool: 'coupling', rule: 'shared-used-by-one-feature' };

function withinRoot(file, root) {
  return file.startsWith(`${root}/`) ? file.slice(root.length + 1) : file;
}

function isProductionIn(layout, root) {
  return (file) =>
    (layout.isSourceFile(file) || layout.isSourceUnderRoot(file, root)) &&
    isReuseProductionPath(withinRoot(file, root));
}

function productionImporters(layout, project, target) {
  return project.names.filter(
    (name) =>
      layout.isSourceFile(name) &&
      moduleReferences(project.sourceFile(name)).some(
        ({ specifier }) => specifier !== undefined && project.resolve(specifier, name) === target,
      ),
  );
}

function planMove({ context, project, layout, entry }) {
  const outside = productionImporters(layout, project, entry.source).find(
    (importer) => !importer.startsWith(entry.directory),
  );
  if (outside !== undefined) {
    return { declined: `${outside} outside ${entry.directory} imports it` };
  }
  const to = path.posix.join(entry.directory, path.posix.basename(entry.source));
  return planFileMove(context, project, { from: entry.source, to });
}

export const sharedUsedByOneFeatureRecipe = {
  id: 'typescript-shared-used-by-one-feature',
  rules: [RULE],
  presets: ['typescript', 'javascript'],
  scope: 'project',
  safety: 'review',
  plan(context) {
    const layout = layoutOf(context.inputs);
    const changed = new Set(context.files.map(({ path: name }) => name));
    return withProject(context, (project) => {
      const graph = projectGraph(project);
      const fixes = [];
      const notes = [];
      for (const sourceRoot of layout.sourceRoots) {
        const entries = sharedUsedByOneFeature(graph, {
          sourceRoot,
          isProduction: isProductionIn(layout, sourceRoot),
        }).filter(({ source }) => changed.has(source));
        for (const entry of entries) {
          const planned = planMove({ context, project, layout, entry });
          if (planned.edits === undefined) {
            notes.push(
              `--fix left ${entry.source}:1 shared-used-by-one-feature: ${planned.declined}`,
            );
          } else {
            fixes.push({ finding: { ...RULE, path: entry.source, line: 1 }, edits: planned.edits });
          }
        }
      }
      return { fixes, notes };
    });
  },
};
