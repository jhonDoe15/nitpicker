import { layoutOf, withProject } from '../model/project-model.mts';
import { moduleReferences } from '../model/module-references.mts';
import { escapeRegExp } from '../../../adapters/typed/tooling.mts';
import type { FixContext, Project, ProjectPlan, ProjectRecipe } from '../typed/project-types.mts';
import {
  analyzeEntryPoints,
  fullLayoutOf,
  layoutFeatures,
  projectGraph,
} from '../typed/reuse-views.mts';
import type { PlanResult } from '../typed/reuse-views.mts';
import { importLine, retargetEdits } from './retarget.mts';
import type { RetargetItem } from './retarget.mts';

const ENTRY_EXTENSIONS = ['ts', 'tsx', 'mts', 'cts', 'js', 'jsx', 'mjs', 'cjs'];
const PUBLIC_BYPASS = 'public-alternative-bypass';
const INDEX_ONLY = 'feature-internals-only-through-index';
const CODE_FILE = String.raw`\.[cm]?[jt]sx?$`;

type Item = Omit<RetargetItem, 'touched' | 'graph'>;

function planAll(
  context: FixContext,
  {
    rule,
    tool,
    items,
  }: { readonly rule: string; readonly tool: string; readonly items: (project: Project) => Item[] },
): ProjectPlan {
  const { fixes, notes }: PlanResult = { fixes: [], notes: [] };
  const touched = new Set<string>();
  return withProject(context, (project) => {
    const graph = projectGraph(project);
    for (const item of items(project)) {
      const planned = retargetEdits(context, project, { ...item, touched, graph });
      if (planned.touches !== undefined) {
        touched.add(planned.touches);
      }
      const line = importLine(project, item.from, item.target);
      if (planned.edits !== undefined) {
        fixes.push({ finding: { tool, rule, path: item.from, line }, edits: planned.edits });
      } else if (planned.declined !== undefined) {
        notes.push(`--fix left ${item.from}:${String(line)} ${rule}: ${planned.declined}`);
      }
    }
    return { fixes, notes };
  });
}

function bypassItems(context: FixContext, project: Project): Item[] {
  const layout = fullLayoutOf(context.inputs);
  const changed = new Set(context.files.map(({ path: name }) => name));
  const graph = projectGraph(project);
  return layout.sourceRoots
    .flatMap((root: string) =>
      analyzeEntryPoints(graph, root, { layout }).publicAlternativeBypasses.map((bypass) => ({
        from: bypass.source,
        target: bypass.target,
        entry: bypass.publicEntryPoint,
      })),
    )
    .filter(({ from }) => changed.has(from) && !context.inputs?.isExcepted?.(PUBLIC_BYPASS, from));
}

export const publicAlternativeBypassRecipe: ProjectRecipe = {
  id: 'typescript-public-alternative-bypass',
  rules: [{ tool: 'entry-points', rule: PUBLIC_BYPASS }],
  presets: ['typescript', 'javascript'],
  scope: 'project',
  safety: 'review',
  plan: (context) =>
    planAll(context, {
      tool: 'entry-points',
      rule: PUBLIC_BYPASS,
      items: (project) => bypassItems(context, project),
    }),
};

function featureEntry(project: Project, target: string): string | undefined {
  const feature = new RegExp(`${layoutFeatures.feature}/`, 'u').exec(target);
  const directory =
    feature === null ? undefined : target.slice(0, feature.index + feature[0].length);
  if (directory === undefined) {
    return undefined;
  }
  return ENTRY_EXTENSIONS.map((extension) => `${directory}index.${extension}`).find((name) =>
    project.has(name),
  );
}

function internalItems(context: FixContext, project: Project): Item[] {
  const layout = layoutOf(context.inputs);
  const root = new RegExp(`(?:^|/)(?:${layout.sourceRoots.map(escapeRegExp).join('|')})/`, 'u');
  const featureRoot = new RegExp(layoutFeatures.featureRoot, 'u');
  const internal = new RegExp(`${layoutFeatures.featureRoot}/[^/]+/(?!index${CODE_FILE})`, 'u');
  return context.files.flatMap(({ path: from }) => {
    const isImporter = root.test(from) && !featureRoot.test(from);
    if (!isImporter || context.inputs?.isExcepted?.(INDEX_ONLY, from)) {
      return [];
    }
    const targets = moduleReferences(project.sourceFile(from))
      .filter(({ kind }) => kind === 'import' || kind === 'export')
      .map(({ specifier }) =>
        specifier === undefined ? undefined : project.resolve(specifier, from),
      )
      .flatMap((target) => (target !== undefined && internal.test(target) ? [target] : []));
    return [...new Set(targets)].flatMap((target) => {
      const entry = featureEntry(project, target);
      return entry === undefined ? [] : [{ from, target, entry }];
    });
  });
}

export const featureInternalsOnlyThroughIndexRecipe: ProjectRecipe = {
  id: 'typescript-feature-internals-only-through-index',
  rules: [{ tool: 'dependency-architecture', rule: INDEX_ONLY }],
  presets: ['typescript', 'javascript'],
  scope: 'project',
  safety: 'review',
  plan: (context) =>
    planAll(context, {
      tool: 'dependency-architecture',
      rule: INDEX_ONLY,
      items: (project) => internalItems(context, project),
    }),
};
