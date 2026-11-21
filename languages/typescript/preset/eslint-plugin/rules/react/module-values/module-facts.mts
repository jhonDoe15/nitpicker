import type TypeScript from 'typescript';
import { resolveModuleSpecifier as untypedResolve } from '../../../../modules/module-resolution.mts';
import { scriptKindOf as untypedScriptKindOf } from '../../../../modules/module-sources.mts';
import { readStamped as untypedReadStamped } from '../../../../modules/stamped-file-cache.mts';
import { ts } from '../../typed/typescript-views.mts';
import { DEFAULT_EXPORT } from '../../../../syntax/exported-components.mts';
import { fileExports } from '../../../../syntax/module-facts.mts';
import { readTextFile } from '../support/file-reads.mts';

export type ImportedName = { readonly source: string; readonly name: string };
export type CalleeShape =
  | { readonly kind: 'name'; readonly name: string }
  | { readonly kind: 'member'; readonly owner: string; readonly name: string }
  | { readonly kind: 'call'; readonly callee: CalleeShape; readonly argumentCount: number };
export type ValueShape =
  | { readonly kind: 'name'; readonly name: string }
  | { readonly kind: 'call'; readonly callee: CalleeShape; readonly argumentCount: number }
  | { readonly kind: 'other' };
type ExportTarget =
  | { readonly kind: 'local'; readonly name: string }
  | { readonly kind: 'value'; readonly shape: ValueShape }
  | { readonly kind: 'forwarded'; readonly from: ImportedName };
export type ModuleFacts = {
  readonly file: string;
  readonly imports: ReadonlyMap<string, ImportedName>;
  readonly values: ReadonlyMap<string, ValueShape>;
  readonly exports: ReadonlyMap<string, ExportTarget>;
};
export type ResolvedValue =
  | { readonly kind: 'package'; readonly binding: ImportedName }
  | { readonly kind: 'value'; readonly facts: ModuleFacts; readonly shape: ValueShape };
type Resolution = { readonly kind: string; readonly path?: string };
type Cache<Value> = Map<string, { readonly stamp: string; readonly value: Value }>;
type Lookup = {
  readonly facts: ModuleFacts;
  readonly name: string;
  readonly scope: 'local' | 'export';
};
type Step = { readonly next?: Lookup; readonly found?: ResolvedValue };

const resolveModuleSpecifier: (written: string, containingFile: string) => Resolution =
  untypedResolve;
const scriptKindOf: (file: string) => TypeScript.ScriptKind = untypedScriptKindOf;
const readStamped: <Value>(
  cache: Cache<Value>,
  file: string,
  read: (file: string) => Value,
) => Value | undefined = untypedReadStamped;

export const NAMESPACE_IMPORT = '*';
const MAX_LOOKUPS = 8;
const MAX_CHARACTERS = 1_000_000;
const LOCAL = 'local';
const EXPORT = 'export';
const factsCache: Cache<ModuleFacts | undefined> = new Map();

function unwrappedValue(expression: TypeScript.Expression): TypeScript.Expression {
  const chain = [expression];
  for (const current of chain) {
    if (
      ts.isParenthesizedExpression(current) ||
      ts.isAsExpression(current) ||
      ts.isSatisfiesExpression(current) ||
      ts.isNonNullExpression(current)
    ) {
      chain.push(current.expression);
    }
  }
  return chain.at(-1) ?? expression;
}

const OTHER: ValueShape = { kind: 'other' };

function simpleCalleeOf(expression: TypeScript.Expression): CalleeShape | undefined {
  const callee = unwrappedValue(expression);
  if (ts.isIdentifier(callee)) {
    return { kind: 'name', name: callee.text };
  }
  return ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression)
    ? { kind: 'member', owner: callee.expression.text, name: callee.name.text }
    : undefined;
}

function calleeShapeOf(expression: TypeScript.Expression): CalleeShape | undefined {
  const callee = unwrappedValue(expression);
  const inner = ts.isCallExpression(callee) ? simpleCalleeOf(callee.expression) : undefined;
  return ts.isCallExpression(callee) && inner !== undefined
    ? { kind: 'call', callee: inner, argumentCount: callee.arguments.length }
    : simpleCalleeOf(callee);
}

function shapeOf(expression: TypeScript.Expression): ValueShape {
  const value = unwrappedValue(expression);
  if (ts.isIdentifier(value)) {
    return { kind: 'name', name: value.text };
  }
  const isPlainCall = ts.isCallExpression(value) && !value.arguments.some(ts.isSpreadElement);
  const callee = isPlainCall ? calleeShapeOf(value.expression) : undefined;
  return ts.isCallExpression(value) && callee !== undefined
    ? { kind: 'call', callee, argumentCount: value.arguments.length }
    : OTHER;
}

function importEntries(statement: TypeScript.ImportDeclaration): [string, ImportedName][] {
  if (!ts.isStringLiteral(statement.moduleSpecifier)) {
    return [];
  }
  const source = statement.moduleSpecifier.text;
  const clause = statement.importClause;
  const named = clause?.namedBindings;
  const defaults: [string, ImportedName][] =
    clause?.name === undefined ? [] : [[clause.name.text, { source, name: DEFAULT_EXPORT }]];
  if (named === undefined) {
    return defaults;
  }
  if (ts.isNamespaceImport(named)) {
    return [...defaults, [named.name.text, { source, name: NAMESPACE_IMPORT }]];
  }
  return [
    ...defaults,
    ...named.elements.map((element): [string, ImportedName] => [
      element.name.text,
      { source, name: (element.propertyName ?? element.name).text },
    ]),
  ];
}

function valueEntries(statement: TypeScript.Statement): [string, ValueShape][] {
  if (!ts.isVariableStatement(statement)) {
    return [];
  }
  const isConst = (statement.declarationList.flags & ts.NodeFlags.Const) !== 0;
  return statement.declarationList.declarations.flatMap(
    ({ name, initializer }): [string, ValueShape][] =>
      isConst && ts.isIdentifier(name) && initializer !== undefined
        ? [[name.text, shapeOf(initializer)]]
        : [],
  );
}

function isExportedStatement(statement: TypeScript.Statement): boolean {
  return (
    ts.canHaveModifiers(statement) &&
    (ts.getModifiers(statement)?.some(({ kind }) => kind === ts.SyntaxKind.ExportKeyword) ?? false)
  );
}

function listedExports(sourceFile: TypeScript.SourceFile): [string, ExportTarget][] {
  const { locals, reexports } = fileExports(sourceFile);
  return [
    ...locals.map(({ local, exported }): [string, ExportTarget] => [
      exported,
      { kind: 'local', name: local },
    ]),
    ...reexports.flatMap(({ specifier, names }) =>
      names.map(({ imported, exported }): [string, ExportTarget] => [
        exported,
        { kind: 'forwarded', from: { source: specifier, name: imported } },
      ]),
    ),
  ];
}

function declaredExports(statement: TypeScript.Statement): [string, ExportTarget][] {
  if (ts.isExportAssignment(statement)) {
    const shape = shapeOf(statement.expression);
    return statement.isExportEquals === true || shape.kind === 'name'
      ? []
      : [[DEFAULT_EXPORT, { kind: 'value', shape }]];
  }
  return isExportedStatement(statement)
    ? valueEntries(statement).map(([name]): [string, ExportTarget] => [
        name,
        { kind: 'local', name },
      ])
    : [];
}

export function moduleFactsOf(file: string, text: string): ModuleFacts {
  const sourceFile = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    scriptKindOf(file),
  );
  const { statements } = sourceFile;
  return {
    file,
    imports: new Map(statements.filter(ts.isImportDeclaration).flatMap(importEntries)),
    values: new Map(statements.flatMap(valueEntries)),
    exports: new Map([...listedExports(sourceFile), ...statements.flatMap(declaredExports)]),
  };
}

function readFacts(file: string): ModuleFacts | undefined {
  const read = readTextFile(file);
  return read.kind === 'read' && read.text.length <= MAX_CHARACTERS
    ? moduleFactsOf(file, read.text)
    : undefined;
}

function factsOfFile(file: string): ModuleFacts | undefined {
  return readStamped(factsCache, file, readFacts);
}

function importStep(facts: ModuleFacts, binding: ImportedName): Step {
  const resolved = resolveModuleSpecifier(binding.source, facts.file);
  if (resolved.kind !== 'file' || resolved.path === undefined) {
    return { found: { kind: 'package', binding } };
  }
  const target = factsOfFile(resolved.path);
  return target === undefined ? {} : { next: { facts: target, name: binding.name, scope: EXPORT } };
}

function exportStep({ facts, name }: Lookup): Step {
  const target = facts.exports.get(name);
  if (target === undefined) {
    return {};
  }
  if (target.kind === 'value') {
    return { found: { kind: 'value', facts, shape: target.shape } };
  }
  return target.kind === 'local'
    ? { next: { facts, name: target.name, scope: LOCAL } }
    : importStep(facts, target.from);
}

function localStep({ facts, name }: Lookup): Step {
  const imported = facts.imports.get(name);
  if (imported !== undefined) {
    return importStep(facts, imported);
  }
  const shape = facts.values.get(name);
  if (shape === undefined) {
    return {};
  }
  return shape.kind === 'name'
    ? { next: { facts, name: shape.name, scope: LOCAL } }
    : { found: { kind: 'value', facts, shape } };
}

export function localValue(facts: ModuleFacts, name: string): ResolvedValue | undefined {
  const pending: Lookup[] = [{ facts, name, scope: LOCAL }];
  for (const lookup of pending) {
    const { next, found } = lookup.scope === LOCAL ? localStep(lookup) : exportStep(lookup);
    if (found !== undefined) {
      return found;
    }
    if (next !== undefined && pending.length < MAX_LOOKUPS) {
      pending.push(next);
    }
  }
  return undefined;
}

export function calleeBinding(facts: ModuleFacts, callee: CalleeShape): ImportedName | undefined {
  if (callee.kind === 'name') {
    const resolved = localValue(facts, callee.name);
    return resolved?.kind === 'package' ? resolved.binding : undefined;
  }
  const owner = callee.kind === 'member' ? facts.imports.get(callee.owner) : undefined;
  const isNamespace = owner?.name === NAMESPACE_IMPORT || owner?.name === DEFAULT_EXPORT;
  return callee.kind === 'member' && owner !== undefined && isNamespace
    ? { source: owner.source, name: callee.name }
    : undefined;
}

export { DEFAULT_EXPORT };
