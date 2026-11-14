import { ts } from '../../../typescript-api/typescript-api.mjs';
import { moduleReferences } from '../model/module-references.mjs';
import { declined, replaceEdit } from '../edits/text-edits.mjs';

const DEFAULT_EXPORT = 'default';

function binding(exportName, local, typeOnly = false) {
  const item = local === exportName ? exportName : `${exportName} as ${local}`;
  return typeOnly ? `type ${item}` : item;
}

function defaultImportEdit(name, clause, exportName) {
  if (clause.namedBindings !== undefined && ts.isNamespaceImport(clause.namedBindings)) {
    return declined(`${name} imports the default and a namespace in one statement`);
  }
  const existing = clause.namedBindings?.elements.map((element) => element.getText()) ?? [];
  const items = [binding(exportName, clause.name.text), ...existing];
  const text = `${clause.isTypeOnly ? 'type ' : ''}{ ${items.join(', ')} }`;
  return { edits: [replaceEdit(name, [clause.getStart(), clause.end], text)] };
}

function isDefaultSpecifier(specifier) {
  return (specifier.propertyName ?? specifier.name).text === DEFAULT_EXPORT;
}

function specifierEdits(name, elements, exportName) {
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

function accessedName(node) {
  const { parent } = node;
  if (ts.isPropertyAccessExpression(parent) && parent.expression === node) {
    return parent.name;
  }
  return ts.isQualifiedName(parent) && parent.left === node ? parent.right : undefined;
}

function namespaceEdits(project, { name, namespace, exportName }) {
  const accesses = [];
  function visit(node) {
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
    edits: accesses
      .filter((accessed) => accessed.text === DEFAULT_EXPORT)
      .map((accessed) => replaceEdit(name, [accessed.getStart(), accessed.end], exportName)),
  };
}

function importEdits(project, { name, node, exportName }) {
  const clause = node.importClause;
  if (clause === undefined) {
    return { edits: [] };
  }
  if (clause.name !== undefined) {
    return defaultImportEdit(name, clause, exportName);
  }
  if (clause.namedBindings !== undefined && ts.isNamespaceImport(clause.namedBindings)) {
    return namespaceEdits(project, { name, namespace: clause.namedBindings, exportName });
  }
  return { edits: specifierEdits(name, clause.namedBindings?.elements ?? [], exportName) };
}

function exportEdits(name, node, exportName) {
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

function fileEdits(project, { name, target, exportName, accepts }) {
  const references = moduleReferences(project.sourceFile(name)).filter(
    ({ kind, specifier }) =>
      (kind === 'import' || kind === 'export') && project.resolve(specifier, name) === target,
  );
  const edits = [];
  for (const { kind, node } of references) {
    const planned =
      kind === 'import'
        ? importEdits(project, { name, node, exportName })
        : exportEdits(name, node, exportName);
    if (planned.declined !== undefined) {
      return planned;
    }
    edits.push(...planned.edits);
  }
  return edits.length > 0 && !accepts(name)
    ? declined(`${name} is outside the files --fix covers`)
    : { edits };
}

export function importerEdits(project, { target, exportName, accepts }) {
  const edits = [];
  for (const name of project.names) {
    const planned = fileEdits(project, { name, target, exportName, accepts });
    if (planned.declined !== undefined) {
      return planned;
    }
    edits.push(...planned.edits);
  }
  return { edits };
}
