import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { readStamped } from './stamped-file-cache.mjs';

function literalSource(node) {
  return node?.type === 'Literal' && typeof node.value === 'string' ? node.value : undefined;
}

function requiredSource(node) {
  const isRequire =
    node?.type === 'CallExpression' &&
    node.callee.type === 'Identifier' &&
    node.callee.name === 'require';
  return isRequire ? literalSource(node.arguments[0]) : undefined;
}

export function moduleSourceOf(node) {
  switch (node.type) {
    case 'ImportDeclaration':
    case 'ImportExpression':
    case 'ExportNamedDeclaration':
    case 'ExportAllDeclaration':
      return literalSource(node.source);
    case 'TSImportEqualsDeclaration':
      return literalSource(node.moduleReference.expression);
    case 'CallExpression':
      return requiredSource(node);
    default:
      return undefined;
  }
}

function topLevelRequires(statement) {
  if (statement.type === 'ExpressionStatement') {
    return [statement.expression];
  }
  return statement.type === 'VariableDeclaration'
    ? statement.declarations.map(({ init }) => init).filter(Boolean)
    : [];
}

export function statementSources(statement) {
  return [statement, ...topLevelRequires(statement)]
    .map(moduleSourceOf)
    .filter((source) => source !== undefined);
}

export function scriptKindOf(file) {
  return /\.[jt]sx$/u.test(file) ? ts.ScriptKind.TSX : ts.ScriptKind.Unknown;
}

function importsAtRuntime(clause) {
  const named = clause?.namedBindings;
  if (clause === undefined || named === undefined || clause.name !== undefined) {
    return clause?.isTypeOnly !== true;
  }
  return (
    !clause.isTypeOnly &&
    (ts.isNamespaceImport(named) ||
      named.elements.length === 0 ||
      named.elements.some((element) => !element.isTypeOnly))
  );
}

function exportsAtRuntime(statement) {
  const clause = statement.exportClause;
  return (
    !statement.isTypeOnly &&
    (clause === undefined ||
      !ts.isNamedExports(clause) ||
      clause.elements.some((element) => !element.isTypeOnly))
  );
}

function nodeReference(node) {
  if (ts.isImportDeclaration(node)) {
    return { source: node.moduleSpecifier, runtime: importsAtRuntime(node.importClause) };
  }
  if (ts.isExportDeclaration(node)) {
    return { source: node.moduleSpecifier, runtime: exportsAtRuntime(node), reexport: true };
  }
  if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
    return { source: node.moduleReference.expression, runtime: !node.isTypeOnly };
  }
  const isLoad =
    ts.isCallExpression(node) &&
    (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
      (ts.isIdentifier(node.expression) && node.expression.text === 'require'));
  return isLoad ? { source: node.arguments[0], runtime: true } : undefined;
}

function scannedReferences(file) {
  const sourceFile = ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    scriptKindOf(file),
  );
  const references = [];
  function visit(node) {
    const reference = nodeReference(node);
    if (reference?.source !== undefined && ts.isStringLiteralLike(reference.source)) {
      references.push({
        source: reference.source.text,
        runtime: reference.runtime,
        reexport: reference.reexport === true,
      });
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return references;
}

const scanCache = new Map();

export function moduleReferencesOf(file) {
  return readStamped(scanCache, file, scannedReferences) ?? [];
}

export function moduleSourcesOf(file) {
  return moduleReferencesOf(file).map(({ source }) => source);
}
