import path from 'node:path';
import type TypeScript from 'typescript';
import { typescriptApi } from '../../../adapters/typed/typescript-program.mts';
import { moduleReferences } from '../model/module-references.mts';
import type { ModuleReference } from '../model/reference-types.mts';
import { reachable } from '../reuse/reachable.mts';
import type { ProjectGraph } from '../typed/reuse-views.mts';
import { declined, replaceEdit, verifyEdits } from '../typed/project-views.mts';
import type { FixContext, Project, ReplaceEdit } from '../typed/project-types.mts';
import { fieldOf } from '../../../../../shared/values/readers.mts';

const ts = typescriptApi();
const SOURCE_EXTENSION = /\.[cm]?[jt]sx?$/u;
const JS_EXTENSION: Readonly<Record<string, string>> = {
  '.ts': '.js',
  '.tsx': '.js',
  '.mts': '.mjs',
  '.cts': '.cjs',
};

type Retargeted = {
  readonly edits?: readonly ReplaceEdit[];
  readonly declined?: string;
  readonly later?: true;
  readonly touches?: string | undefined;
};

type ImportedName = { readonly name: string; readonly typeOnly: boolean };

type Retarget = {
  readonly from: string;
  readonly target: string;
  readonly entry: string;
};

export type RetargetItem = Retarget & {
  readonly touched: Set<string>;
  readonly graph: ProjectGraph;
};

function specifierFor(from: string, entry: string, style: string | undefined): string {
  const base = entry.replace(SOURCE_EXTENSION, '');
  const relative = path.posix.relative(path.posix.dirname(from), base);
  const bare = relative.startsWith('.') ? relative : `./${relative}`;
  const styleExtension = style === undefined ? undefined : SOURCE_EXTENSION.exec(style)?.[0];
  if (styleExtension === undefined) {
    return bare;
  }
  const entryExtension = path.posix.extname(entry);
  const keepsSource = styleExtension.startsWith('.t') || styleExtension === '.mts';
  const extension = keepsSource ? entryExtension : (JS_EXTENSION[entryExtension] ?? entryExtension);
  return `${bare}${extension}`;
}

function importedNames(node: TypeScript.Node): ImportedName[] | undefined {
  if (!(ts.isImportDeclaration(node) || ts.isExportDeclaration(node))) {
    return undefined;
  }
  const clause = ts.isImportDeclaration(node) ? node.importClause : node.exportClause;
  const bindings =
    clause !== undefined && ts.isImportClause(clause) ? clause.namedBindings : clause;
  if (clause === undefined || (ts.isImportClause(clause) && clause.name !== undefined)) {
    return undefined;
  }
  if (bindings === undefined || !(ts.isNamedImports(bindings) || ts.isNamedExports(bindings))) {
    return undefined;
  }
  const typeOnly =
    (ts.isImportClause(clause) && fieldOf(clause, 'isTypeOnly') === true) ||
    (ts.isExportDeclaration(node) && node.isTypeOnly);
  return bindings.elements.map((element) => ({
    name: (element.propertyName ?? element.name).text,
    typeOnly: typeOnly || element.isTypeOnly,
  }));
}

function exportSymbol(
  project: Project,
  name: string,
  exportName: string,
): TypeScript.Symbol | undefined {
  const checker = project.program.getTypeChecker();
  const file = project.sourceFile(name);
  const module = file === undefined ? undefined : checker.getSymbolAtLocation(file);
  const found =
    module === undefined
      ? undefined
      : checker.getExportsOfModule(module).find((symbol) => symbol.name === exportName);
  const alias = found !== undefined && (found.flags & ts.SymbolFlags.Alias) !== 0;
  return alias ? checker.getAliasedSymbol(found) : found;
}

function missingNames(
  project: Project,
  { target, entry, names }: Omit<Retarget, 'from'> & { readonly names: readonly ImportedName[] },
): ImportedName[] {
  return names.filter(({ name }) => {
    const wanted = exportSymbol(project, target, name);
    return wanted === undefined || exportSymbol(project, entry, name) !== wanted;
  });
}

function entryAppend(
  project: Project,
  {
    entry,
    target,
    missing,
    style,
  }: Omit<Retarget, 'from'> & { readonly missing: readonly ImportedName[]; readonly style: string },
): ReplaceEdit {
  const text = project.read(entry) ?? '';
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

function rewrittenEdits(
  project: Project,
  {
    from,
    target,
    entry,
    references,
    missing,
  }: Retarget & {
    readonly references: readonly ModuleReference[];
    readonly missing: readonly ImportedName[];
  },
): ReplaceEdit[] {
  const specifier = references[0]?.specifier;
  const edits = references.flatMap(({ literal }) =>
    literal === undefined
      ? []
      : [
          replaceEdit(
            from,
            [literal.getStart() + 1, literal.end - 1],
            specifierFor(from, entry, specifier),
          ),
        ],
  );
  return missing.length === 0
    ? edits
    : [...edits, entryAppend(project, { entry, target, missing, style: specifier ?? '' })];
}

function addsCycle(
  graph: ProjectGraph,
  { from, target, entry, adds }: Retarget & { readonly adds: boolean },
): boolean {
  return reachable(graph, entry, from) || (adds && reachable(graph, target, entry));
}

export function retargetEdits(
  context: FixContext,
  project: Project,
  { from, target, entry, touched, graph }: RetargetItem,
): Retargeted {
  const references = moduleReferences(project.sourceFile(from)).filter(
    ({ kind, specifier }) =>
      (kind === 'import' || kind === 'export') &&
      specifier !== undefined &&
      project.resolve(specifier, from) === target,
  );
  const found = references.map(({ node }) => importedNames(node));
  const names = found.flatMap((each) => each ?? []);
  if (references.length === 0 || found.includes(undefined)) {
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
  const touches = missing.length > 0 ? entry : undefined;
  return unsafe === undefined ? { edits: all, touches } : declined(unsafe);
}

export function importLine(project: Project, from: string, target: string): number {
  const reference = moduleReferences(project.sourceFile(from)).find(
    ({ kind, specifier }) =>
      (kind === 'import' || kind === 'export') &&
      specifier !== undefined &&
      project.resolve(specifier, from) === target,
  );
  return reference === undefined ? 1 : project.lineOf(from, reference.node.getStart());
}

function styleOf(project: Project, name: string): string | undefined {
  const sourceFile = project.sourceFile(name);
  const own =
    sourceFile === undefined
      ? undefined
      : moduleReferences(sourceFile).find(({ specifier }) => specifier?.startsWith('.'));
  return own?.specifier;
}

export function importSpecifier(project: Project, from: string, target: string): string {
  const style =
    styleOf(project, from) ??
    project.names.map((name) => styleOf(project, name)).find((found) => found !== undefined);
  const { moduleResolution } = project.program.getCompilerOptions();
  const nodeNext = [ts.ModuleResolutionKind.Node16, ts.ModuleResolutionKind.NodeNext].some(
    (kind) => kind === moduleResolution,
  );
  return specifierFor(from, target, style ?? (nodeNext ? 'x.js' : 'x'));
}

export function keptImport(
  node: TypeScript.ImportDeclaration,
  clause: TypeScript.ImportClause,
  kept: readonly TypeScript.ImportSpecifier[],
): string {
  const head = fieldOf(clause, 'isTypeOnly') === true ? 'import type ' : 'import ';
  const parts = [
    ...(clause.name === undefined ? [] : [clause.name.text]),
    ...(kept.length === 0 ? [] : [`{ ${kept.map((each) => each.getText()).join(', ')} }`]),
  ];
  return parts.length === 0
    ? ''
    : `${head}${parts.join(', ')} from ${node.moduleSpecifier.getText()};`;
}
