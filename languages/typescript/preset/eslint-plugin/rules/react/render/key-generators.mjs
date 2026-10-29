import { readFileSync } from 'node:fs';
import { ts } from '../../../../../typescript-api/typescript-api.mjs';
import { scriptKindOf } from '../../../../modules/module-sources.mjs';
import { readStamped } from '../../../../modules/stamped-file-cache.mjs';

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
const globalObjects = new Set(['window', 'globalThis', 'self']);

function withoutGlobalObject(names) {
  return names.length > 1 && globalObjects.has(names[0]) ? names.slice(1) : names;
}

export function isGeneratorModule(source) {
  return generatorModules.has(source);
}

export function generatorCall(names, { bound, source }) {
  const isGenerator = bound
    ? source !== undefined &&
      (generatorModules.has(source) || (cryptoModules.has(source) && names.at(-1) === 'randomUUID'))
    : globalGenerators.has(withoutGlobalObject(names).join('.'));
  return isGenerator ? names.join('.') : undefined;
}

function chainNames(expression) {
  const chain = [expression];
  for (const current of chain) {
    if (ts.isPropertyAccessExpression(current)) {
      chain.push(current.expression);
    }
  }
  const root = chain.at(-1);
  const members = chain.slice(0, -1).toReversed();
  return ts.isIdentifier(root) ? [root.text, ...members.map(({ name }) => name.text)] : undefined;
}

function importedLocals(clause) {
  const named = clause?.namedBindings;
  if (named === undefined) {
    return [clause?.name];
  }
  const locals = ts.isNamespaceImport(named)
    ? [named.name]
    : named.elements.map(({ name }) => name);
  return [clause.name, ...locals];
}

function statementBindings(statement) {
  if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
    const binding = { bound: true, source: statement.moduleSpecifier.text };
    return importedLocals(statement.importClause)
      .filter(Boolean)
      .map((local) => [local.text, binding]);
  }
  if (ts.isFunctionDeclaration(statement) && statement.name !== undefined) {
    return [[statement.name.text, { bound: true }]];
  }
  const declarations = ts.isVariableStatement(statement)
    ? statement.declarationList.declarations
    : [];
  return declarations
    .filter(({ name }) => ts.isIdentifier(name))
    .map(({ name }) => [name.text, { bound: true }]);
}

function topLevelBindings(sourceFile) {
  return new Map(sourceFile.statements.flatMap(statementBindings));
}

function isExported(statement) {
  return statement.modifiers?.some(({ kind }) => kind === ts.SyntaxKind.ExportKeyword) ?? false;
}

function exportedFunctionsOf(statement) {
  if (ts.isFunctionDeclaration(statement)) {
    return statement.name === undefined ? [] : [[statement.name.text, statement]];
  }
  const declarations = ts.isVariableStatement(statement)
    ? statement.declarationList.declarations
    : [];
  return declarations
    .filter(
      ({ name, initializer }) =>
        ts.isIdentifier(name) &&
        initializer !== undefined &&
        (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer)),
    )
    .map(({ name, initializer }) => [name.text, initializer]);
}

function exportedFunctions(sourceFile) {
  return sourceFile.statements.filter(isExported).flatMap(exportedFunctionsOf);
}

function returnedExpressions(fn) {
  if (fn.body === undefined || !ts.isBlock(fn.body)) {
    return fn.body === undefined ? [] : [fn.body];
  }
  const returned = [];
  function visit(node) {
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

function generatesIn(expression, bindings) {
  const unbound = { bound: false };
  let found = false;
  function visit(node) {
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
    if (!found && !ts.isFunctionLike(node)) {
      ts.forEachChild(node, visit);
    }
  }
  visit(expression);
  return found;
}

function generatingExports(file) {
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

const exportCache = new Map();

export function exportGenerates(file, name) {
  return readStamped(exportCache, file, generatingExports)?.has(name) ?? false;
}
