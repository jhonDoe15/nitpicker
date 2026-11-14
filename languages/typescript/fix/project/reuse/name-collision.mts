import path from 'node:path';
import type TypeScript from 'typescript';
import { typescriptApi } from '../../../adapters/typed/typescript-program.mts';
import { moduleReferences } from '../model/module-references.mts';
import { layoutOf, withProject } from '../model/project-model.mts';
import type { FixContext, Planned, Project, ProjectRecipe } from '../typed/project-types.mts';
import { declined, inCasing, renameEdits, verifyEdits } from '../typed/project-views.mts';
import { recordPlan } from '../typed/reuse-views.mts';
import type { PlanResult, ToolFinding } from '../typed/reuse-views.mts';
import { reuseFindingsFor } from './reuse-findings.mts';

const ts = typescriptApi();

const RULE = 'exported-name-collision';

type NamedImport = {
  readonly element: TypeScript.ImportSpecifier;
  readonly module: string;
  readonly imported: string;
  readonly local: string;
};

function namedImports(project: Project, name: string): NamedImport[] {
  return moduleReferences(project.sourceFile(name))
    .filter(({ kind }) => kind === 'import')
    .flatMap(({ node, specifier }) => {
      const namedBindings = ts.isImportDeclaration(node)
        ? node.importClause?.namedBindings
        : undefined;
      const module = specifier === undefined ? undefined : project.resolve(specifier, name);
      return namedBindings !== undefined && ts.isNamedImports(namedBindings) && module !== undefined
        ? namedBindings.elements.map((element) => ({
            element,
            module,
            imported: (element.propertyName ?? element.name).text,
            local: element.name.text,
          }))
        : [];
    });
}

function aliasFor(symbol: string, module: string): string {
  const folder = path.posix.basename(path.posix.dirname(module));
  const stem = folder === '.' ? (path.posix.basename(module).split('.')[0] ?? '') : folder;
  const isType = /^[A-Z]/u.test(symbol);
  const prefix = inCasing(stem, isType ? 'PascalCase' : 'camelCase');
  const rest = symbol.charAt(0).toUpperCase() + symbol.slice(1);
  return `${String(prefix)}${rest}`;
}

function planImporter(
  context: FixContext,
  project: Project,
  { importer, finding }: { readonly importer: string; readonly finding: ToolFinding },
): Planned | undefined {
  const imports = namedImports(project, importer);
  const keeper = imports.find(
    ({ imported, local, module }) =>
      imported === finding.symbol && local === imported && module === finding.path,
  );
  const collides = imports.some(
    ({ imported, module }) => imported === finding.symbol && module !== finding.path,
  );
  if (keeper === undefined || !collides) {
    return undefined;
  }
  const renamed = renameEdits(project, {
    name: importer,
    offset: keeper.element.name.getStart(),
    newName: aliasFor(finding.symbol, finding.path),
    accepts: context.accepts,
  });
  if (renamed.declined !== undefined) {
    return renamed;
  }
  const unsafe = verifyEdits(context, project, renamed.edits);
  return unsafe === undefined ? { edits: renamed.edits } : declined(unsafe);
}

export const exportedNameCollisionRecipe: ProjectRecipe = {
  id: 'typescript-exported-name-collision',
  rules: [{ tool: 'structure', rule: RULE }],
  presets: ['typescript', 'javascript'],
  scope: 'project',
  safety: 'safe',
  plan(context) {
    const layout = layoutOf(context.inputs);
    const changed = new Set(context.files.map(({ path: name }) => name));
    const found = reuseFindingsFor(context, RULE).filter(({ path: name }) => changed.has(name));
    if (found.length === 0) {
      return { fixes: [], notes: [] };
    }
    return withProject(context, (project) => {
      const result: PlanResult = { fixes: [], notes: [] };
      const sources = project.names.filter((name) => layout.isSourceFile(name));
      for (const finding of found) {
        for (const importer of sources) {
          const planned = planImporter(context, project, { importer, finding });
          const line = finding.location?.line ?? 1;
          const located = { tool: finding.tool, rule: RULE, path: finding.path, line };
          recordPlan(result, { planned, finding: located, rule: RULE });
        }
      }
      return result;
    });
  },
};
