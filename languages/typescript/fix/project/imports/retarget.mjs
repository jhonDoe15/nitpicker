import path from 'node:path';
import { ts } from '../../../typescript-api/typescript-api.mjs';
import { declined, replaceEdit } from '../edits/text-edits.mjs';
import { verifyEdits } from '../edits/verify-edits.mjs';
import { moduleReferences } from '../model/module-references.mjs';
import { reachable } from '../reuse/reachable.mjs';

const SOURCE_EXTENSION = /\.[cm]?[jt]sx?$/u;
const JS_EXTENSION = { '.ts': '.js', '.tsx': '.js', '.mts': '.mjs', '.cts': '.cjs' };

function specifierFor(from, entry, style) {
  const base = entry.replace(SOURCE_EXTENSION, '');
  const relative = path.posix.relative(path.posix.dirname(from), base);
  const bare = relative.startsWith('.') ? relative : `./${relative}`;
  const styleExtension = SOURCE_EXTENSION.exec(style)?.[0];
  if (styleExtension === undefined) {
    return bare;
  }
  const entryExtension = path.posix.extname(entry);
  const keepsSource = styleExtension.startsWith('.t') || styleExtension === '.mts';
  const extension = keepsSource ? entryExtension : (JS_EXTENSION[entryExtension] ?? entryExtension);
  return `${bare}${extension}`;
}

function importedNames(node) {
  const clause = node.importClause ?? node.exportClause;
  const bindings = ts.isImportDeclaration(node) ? clause?.namedBindings : clause;
  if (clause === undefined || (ts.isImportDeclaration(node) && clause.name !== undefined)) {
    return undefined;
  }
  if (bindings === undefined || !(ts.isNamedImports(bindings) || ts.isNamedExports(bindings))) {
    return undefined;
  }
  const typeOnly = clause.isTypeOnly === true || node.isTypeOnly === true;
  return bindings.elements.map((element) => ({
    name: (element.propertyName ?? element.name).text,
    typeOnly: typeOnly || element.isTypeOnly === true,
  }));
}

function exportSymbol(project, name, exportName) {
  const checker = project.program.getTypeChecker();
  const module = checker.getSymbolAtLocation(project.sourceFile(name));
  const found =
    module === undefined
      ? undefined
      : checker.getExportsOfModule(module).find((symbol) => symbol.name === exportName);
  const alias = found !== undefined && (found.flags & ts.SymbolFlags.Alias) !== 0;
  return alias ? checker.getAliasedSymbol(found) : found;
}

function missingNames(project, { target, entry, names }) {
  return names.filter(({ name }) => {
    const wanted = exportSymbol(project, target, name);
    return wanted === undefined || exportSymbol(project, entry, name) !== wanted;
  });
}

function entryAppend(project, { entry, target, missing, style }) {
  const text = project.read(entry);
  const specifier = specifierFor(entry, target, style);
  const values = missing.filter(({ typeOnly }) => !typeOnly).map(({ name }) => name);
  const types = missing.filter(({ typeOnly }) => typeOnly).map(({ name }) => name);
  const lines = [
    ...(values.length === 0 ? [] : [`export { ${values.join(', ')} } from '${specifier}';`]),
    ...(types.length === 0 ? [] : [`export type { ${types.join(', ')} } from '${specifier}';`]),
  ];
  const separator = text === '' || text.endsWith('\n') ? '' : '\n';
  return replaceEdit(entry, [text.length, text.length], `${separator}${lines.join('\n')}\n`);
}

function rewrittenEdits(project, { from, target, entry, references, missing }) {
  const [{ specifier }] = references;
  const edits = references.map(({ literal }) =>
    replaceEdit(
      from,
      [literal.getStart() + 1, literal.end - 1],
      specifierFor(from, entry, specifier),
    ),
  );
  return missing.length === 0
    ? edits
    : [...edits, entryAppend(project, { entry, target, missing, style: specifier })];
}

function addsCycle(graph, { from, target, entry, adds }) {
  return reachable(graph, entry, from) || (adds && reachable(graph, target, entry));
}

export function retargetEdits(context, project, { from, target, entry, touched, graph }) {
  const references = moduleReferences(project.sourceFile(from)).filter(
    ({ kind, specifier }) =>
      (kind === 'import' || kind === 'export') && project.resolve(specifier, from) === target,
  );
  const names = references.flatMap(({ node }) => importedNames(node) ?? [undefined]);
  if (references.length === 0 || names.includes(undefined)) {
    return declined(
      'it imports a default, a namespace or everything, which --fix does not retarget',
    );
  }
  const missing = missingNames(project, { target, entry, names });
  if (addsCycle(graph, { from, target, entry, adds: missing.length > 0 })) {
    return declined(`pointing ${from} at ${entry} would add an import cycle`);
  }
  if (missing.length > 0 && (touched.has(entry) || !context.accepts(entry))) {
    return touched.has(entry)
      ? { later: true }
      : declined(`${entry} is outside the files --fix covers`);
  }
  const all = rewrittenEdits(project, { from, target, entry, references, missing });
  const unsafe = verifyEdits(context, project, all);
  if (unsafe === undefined && missing.length > 0) {
    touched.add(entry);
  }
  return unsafe === undefined ? { edits: all } : declined(unsafe);
}

export function importLine(project, from, target) {
  const reference = moduleReferences(project.sourceFile(from)).find(
    ({ kind, specifier }) =>
      (kind === 'import' || kind === 'export') && project.resolve(specifier, from) === target,
  );
  return reference === undefined ? 1 : project.lineOf(from, reference.node.getStart());
}

function styleOf(project, name) {
  const sourceFile = project.sourceFile(name);
  const own =
    sourceFile === undefined
      ? undefined
      : moduleReferences(sourceFile).find(({ specifier }) => specifier?.startsWith('.'));
  return own?.specifier;
}

export function importSpecifier(project, from, target) {
  const style =
    styleOf(project, from) ??
    project.names.map((name) => styleOf(project, name)).find((found) => found !== undefined);
  const nodeNext = [ts.ModuleResolutionKind.Node16, ts.ModuleResolutionKind.NodeNext].includes(
    project.program.getCompilerOptions().moduleResolution,
  );
  return specifierFor(from, target, style ?? (nodeNext ? 'x.js' : 'x'));
}
