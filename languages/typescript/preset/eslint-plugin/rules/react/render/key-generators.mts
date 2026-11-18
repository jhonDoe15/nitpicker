import { readFileSync } from 'node:fs';
import type TypeScript from 'typescript';
import {
  isExported as untypedIsExported,
  scriptKindOf as untypedScriptKindOf,
} from '../../../../modules/module-sources.mjs';
import { readStamped as untypedReadStamped } from '../../../../modules/stamped-file-cache.mjs';
import { ts } from '../../typed/typescript-views.mts';

export type Binding = { readonly bound: boolean; readonly source?: string };
type NameChain = readonly [string, ...string[]];
type Entry = readonly [string, Binding];
type FunctionLike =
  TypeScript.FunctionDeclaration | TypeScript.ArrowFunction | TypeScript.FunctionExpression;
type Cache<Value> = Map<string, { readonly stamp: string; readonly value: Value }>;

const isExported: (statement: TypeScript.Node) => boolean = untypedIsExported;
const scriptKindOf: (file: string) => TypeScript.ScriptKind = untypedScriptKindOf;
const readStamped: <Value>(
  cache: Cache<Value>,
  file: string,
  read: (file: string) => Value,
) => Value | undefined = untypedReadStamped;

const globalGenerators = new Set([
  'Math.random',
  'Date.now',
  'performance.now',
  'crypto.randomUUID',
  'randomUUID',
  'uuid',
  'uuidv4',
  'v4',
  'nanoid',
  'cuid',
  'createId',
]);
const generatorModules = new Set([
  'uuid',
  'nanoid',
  'nanoid/non-secure',
  'cuid',
  '@paralleldrive/cuid2',
  'ulid',
  'short-uuid',
]);
const cryptoModules = new Set(['crypto', 'node:crypto']);
const globalObjects = new Set<string | undefined>(['window', 'globalThis', 'self']);

function withoutGlobalObject(names: readonly string[]): readonly string[] {
  return names.length > 1 && globalObjects.has(names[0]) ? names.slice(1) : names;
}

export function isGeneratorModule(source: string): boolean {
  return generatorModules.has(source);
}

export function generatorCall(
  names: readonly string[],
  { bound, source }: Binding,
): string | undefined {
  const isGenerator = bound
    ? source !== undefined &&
      (generatorModules.has(source) || (cryptoModules.has(source) && names.at(-1) === 'randomUUID'))
    : globalGenerators.has(withoutGlobalObject(names).join('.'));
  return isGenerator ? names.join('.') : undefined;
}

function chainNames(expression: TypeScript.Expression): NameChain | undefined {
  const chain = [expression];
  for (const current of chain) {
    if (ts.isPropertyAccessExpression(current)) {
      chain.push(current.expression);
    }
  }
  const root = chain.at(-1);
  const members = chain.slice(0, -1).toReversed();
  return root !== undefined && ts.isIdentifier(root)
    ? [
        root.text,
        ...members.flatMap((member) =>
          ts.isPropertyAccessExpression(member) ? member.name.text : [],
        ),
      ]
    : undefined;
}

function importedLocals(
  clause: TypeScript.ImportClause | undefined,
): (TypeScript.Identifier | undefined)[] {
  const named = clause?.namedBindings;
  if (named === undefined) {
    return [clause?.name];
  }
  const locals = ts.isNamespaceImport(named)
    ? [named.name]
    : named.elements.map(({ name }) => name);
  return [clause?.name, ...locals];
}

function statementBindings(statement: TypeScript.Statement): Entry[] {
  if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
    const binding = { bound: true, source: statement.moduleSpecifier.text };
    return importedLocals(statement.importClause).flatMap((local): Entry[] =>
      local === undefined ? [] : [[local.text, binding]],
    );
  }
  if (ts.isFunctionDeclaration(statement) && statement.name !== undefined) {
    return [[statement.name.text, { bound: true }]];
  }
  const declarations = ts.isVariableStatement(statement)
    ? statement.declarationList.declarations
    : [];
  return declarations.flatMap(({ name }): Entry[] =>
    ts.isIdentifier(name) ? [[name.text, { bound: true }]] : [],
  );
}

function topLevelBindings(sourceFile: TypeScript.SourceFile): Map<string, Binding> {
  return new Map(sourceFile.statements.flatMap(statementBindings));
}

function exportedFunctionsOf(statement: TypeScript.Statement): (readonly [string, FunctionLike])[] {
  if (ts.isFunctionDeclaration(statement)) {
    return statement.name === undefined ? [] : [[statement.name.text, statement]];
  }
  const declarations = ts.isVariableStatement(statement)
    ? statement.declarationList.declarations
    : [];
  return declarations.flatMap(({ name, initializer }): (readonly [string, FunctionLike])[] =>
    ts.isIdentifier(name) &&
    initializer !== undefined &&
    (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer))
      ? [[name.text, initializer]]
      : [],
  );
}

function exportedFunctions(sourceFile: TypeScript.SourceFile): (readonly [string, FunctionLike])[] {
  return sourceFile.statements.filter(isExported).flatMap(exportedFunctionsOf);
}

function returnedExpressions(fn: FunctionLike): TypeScript.Node[] {
  if (fn.body === undefined || !ts.isBlock(fn.body)) {
    return fn.body === undefined ? [] : [fn.body];
  }
  const returned: TypeScript.Node[] = [];
  function visit(node: TypeScript.Node): void {
    if (ts.isReturnStatement(node) && node.expression !== undefined) {
      returned.push(node.expression);
    }
    if (!ts.isFunctionLike(node)) {
      ts.forEachChild(node, visit);
    }
  }
  ts.forEachChild(fn.body, visit);
  return returned;
}

function generatesIn(expression: TypeScript.Node, bindings: Map<string, Binding>): boolean {
  const unbound: Binding = { bound: false };
  let found = false;
  function visit(node: TypeScript.Node): void {
    const names = ts.isCallExpression(node) ? chainNames(node.expression) : undefined;
    const isClockRead =
      ts.isNewExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'Date' &&
      (node.arguments?.length ?? 0) === 0 &&
      !bindings.has('Date');
    found ||=
      isClockRead ||
      (names !== undefined &&
        generatorCall(names, bindings.get(names[0]) ?? unbound) !== undefined);
    if (!(found || ts.isFunctionLike(node))) {
      ts.forEachChild(node, visit);
    }
  }
  visit(expression);
  return found;
}

function generatingExports(file: string): Set<string> {
  const sourceFile = ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    scriptKindOf(file),
  );
  const bindings = topLevelBindings(sourceFile);
  return new Set(
    exportedFunctions(sourceFile)
      .filter(([, fn]) =>
        returnedExpressions(fn).some((expression) => generatesIn(expression, bindings)),
      )
      .map(([name]) => name),
  );
}

const exportCache: Cache<Set<string>> = new Map();

export function exportGenerates(file: string, name: string): boolean {
  return readStamped(exportCache, file, generatingExports)?.has(name) ?? false;
}
