import type TypeScript from 'typescript';
import { fieldOf } from '../../../../../shared/values/readers.mts';
import { typescriptApi } from '../../../adapters/typed/typescript-program.mts';
import { moduleReferences } from '../model/module-references.mts';
import { declined, replaceEdit } from '../edits/text-edits.mts';
import type { Planned, Project, ProjectEdit } from '../typed/project-types.mts';
import { appendAll } from '../../../../../shared/lists/lists.mts';

type Specifier = TypeScript.ImportSpecifier | TypeScript.ExportSpecifier;
type Request = {
  readonly target: string;
  readonly exportName: string;
  readonly accepts: (name: string) => boolean;
};

const ts = typescriptApi();
const DEFAULT_EXPORT = 'default';

function binding(exportName: string, local: string, typeOnly = false): string {
  const item = local === exportName ? exportName : `${exportName} as ${local}`;
  return typeOnly ? `type ${item}` : item;
}

function defaultImportEdit(
  name: string,
  { clause, local }: { clause: TypeScript.ImportClause; local: string },
  exportName: string,
): Planned {
  if (clause.namedBindings !== undefined && ts.isNamespaceImport(clause.namedBindings)) {
    return declined(`${name} imports the default and a namespace in one statement`);
  }
  const existing =
    clause.namedBindings === undefined
      ? []
      : clause.namedBindings.elements.map((element) => element.getText());
  const items = [binding(exportName, local), ...existing];
  const text = `${fieldOf(clause, 'isTypeOnly') === true ? 'type ' : ''}{ ${items.join(', ')} }`;
  return { edits: [replaceEdit(name, [clause.getStart(), clause.end], text)] };
}

function isDefaultSpecifier(specifier: Specifier): boolean {
  return (specifier.propertyName ?? specifier.name).text === DEFAULT_EXPORT;
}

function specifierEdits(
  name: string,
  elements: readonly Specifier[],
  exportName: string,
): ProjectEdit[] {
  return elements
    .filter(isDefaultSpecifier)
    .map((specifier) =>
      replaceEdit(
        name,
        [specifier.getStart(), specifier.end],
        binding(exportName, specifier.name.text, specifier.isTypeOnly),
      ),
    );
}

function accessedName(
  node: TypeScript.Identifier,
): TypeScript.MemberName | TypeScript.Identifier | undefined {
  const { parent } = node;
  if (ts.isPropertyAccessExpression(parent) && parent.expression === node) {
    return parent.name;
  }
  return ts.isQualifiedName(parent) && parent.left === node ? parent.right : undefined;
}

function namespaceEdits(
  project: Project,
  {
    name,
    namespace,
    exportName,
  }: { name: string; namespace: TypeScript.NamespaceImport; exportName: string },
): Planned {
  const accesses: (TypeScript.MemberName | TypeScript.Identifier | undefined)[] = [];
  function visit(node: TypeScript.Node | undefined): void {
    if (node === undefined) {
      return;
    }
    if (ts.isIdentifier(node) && node.text === namespace.name.text && node !== namespace.name) {
      accesses.push(accessedName(node));
    }
    ts.forEachChild(node, visit);
  }
  visit(project.sourceFile(name));
  if (accesses.includes(undefined)) {
    return declined(`${name} passes the namespace import around`);
  }
  return {
    edits: accesses.flatMap((accessed) =>
      accessed !== undefined && accessed.text === DEFAULT_EXPORT
        ? [replaceEdit(name, [accessed.getStart(), accessed.end], exportName)]
        : [],
    ),
  };
}

function importEdits(
  project: Project,
  {
    name,
    node,
    exportName,
  }: { name: string; node: TypeScript.ImportDeclaration; exportName: string },
): Planned {
  const clause = node.importClause;
  if (clause === undefined) {
    return { edits: [] };
  }
  if (clause.name !== undefined) {
    return defaultImportEdit(name, { clause, local: clause.name.text }, exportName);
  }
  if (clause.namedBindings !== undefined && ts.isNamespaceImport(clause.namedBindings)) {
    return namespaceEdits(project, { name, namespace: clause.namedBindings, exportName });
  }
  const elements = clause.namedBindings === undefined ? [] : clause.namedBindings.elements;
  return { edits: specifierEdits(name, elements, exportName) };
}

function exportEdits(
  name: string,
  node: TypeScript.ExportDeclaration,
  exportName: string,
): Planned {
  if (node.exportClause !== undefined && ts.isNamespaceExport(node.exportClause)) {
    return declined(`${name} re-exports the module as a namespace`);
  }
  const elements =
    node.exportClause !== undefined && ts.isNamedExports(node.exportClause)
      ? node.exportClause.elements
      : [];
  if (
    elements.some((element) => element.name.text === DEFAULT_EXPORT && isDefaultSpecifier(element))
  ) {
    return declined(`${name} re-exports the default export as its own default`);
  }
  return { edits: specifierEdits(name, elements, exportName) };
}

function plannedFor(
  project: Project,
  { name, node, exportName }: { name: string; node: TypeScript.Node; exportName: string },
): Planned {
  if (ts.isImportDeclaration(node)) {
    return importEdits(project, { name, node, exportName });
  }
  return ts.isExportDeclaration(node) ? exportEdits(name, node, exportName) : { edits: [] };
}

function fileEdits(
  project: Project,
  { name, target, exportName, accepts }: Request & { name: string },
): Planned {
  const references = moduleReferences(project.sourceFile(name)).filter(
    ({ kind, specifier }) =>
      (kind === 'import' || kind === 'export') && project.resolve(specifier ?? '', name) === target,
  );
  const edits: ProjectEdit[] = [];
  for (const { node } of references) {
    const planned = plannedFor(project, { name, node, exportName });
    if (planned.declined !== undefined) {
      return planned;
    }
    appendAll(edits, planned.edits);
  }
  return edits.length > 0 && !accepts(name)
    ? declined(`${name} is outside the files --fix covers`)
    : { edits };
}

export function importerEdits(project: Project, { target, exportName, accepts }: Request): Planned {
  const edits: ProjectEdit[] = [];
  for (const name of project.names) {
    const planned = fileEdits(project, { name, target, exportName, accepts });
    if (planned.declined !== undefined) {
      return planned;
    }
    appendAll(edits, planned.edits);
  }
  return { edits };
}
