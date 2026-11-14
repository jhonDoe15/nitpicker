import path from 'node:path';
import { ts } from '../../../typescript-api/typescript-api.mjs';
import { renameEdits } from '../edits/symbol-rename.mjs';
import { declined } from '../edits/text-edits.mjs';
import { verifyEdits } from '../edits/verify-edits.mjs';
import { moduleReferences } from '../model/module-references.mjs';
import { inCasing } from '../model/names.mjs';
import { layoutOf, withProject } from '../model/project-model.mjs';
import { recordPlan } from '../plan/record-plan.mjs';
import { reuseFindingsFor } from './reuse-findings.mjs';

const RULE = 'exported-name-collision';

function namedImports(project, name) {
  return moduleReferences(project.sourceFile(name))
    .filter(({ kind, node }) => kind === 'import' && node.importClause?.namedBindings !== undefined)
    .flatMap(({ node, specifier }) => {
      const { namedBindings } = node.importClause;
      const module = project.resolve(specifier, name);
      return ts.isNamedImports(namedBindings) && module !== undefined
        ? namedBindings.elements.map((element) => ({
            element,
            module,
            imported: (element.propertyName ?? element.name).text,
            local: element.name.text,
          }))
        : [];
    });
}

function aliasFor(symbol, module) {
  const folder = path.posix.basename(path.posix.dirname(module));
  const stem = folder === '.' ? path.posix.basename(module).split('.')[0] : folder;
  const isType = /^[A-Z]/u.test(symbol);
  const prefix = inCasing(stem, isType ? 'PascalCase' : 'camelCase');
  const rest = symbol.charAt(0).toUpperCase() + symbol.slice(1);
  return `${prefix}${rest}`;
}

function planImporter(context, project, { importer, finding }) {
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

export const exportedNameCollisionRecipe = {
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
      const result = { fixes: [], notes: [] };
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
