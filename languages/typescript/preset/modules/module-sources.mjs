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

function scriptKindOf(file) {
  return /\.[jt]sx$/u.test(file) ? ts.ScriptKind.TSX : ts.ScriptKind.Unknown;
}

function nodeSource(node) {
  if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
    return node.moduleSpecifier;
  }
  if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
    return node.moduleReference.expression;
  }
  const isLoad =
    ts.isCallExpression(node) &&
    (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
      (ts.isIdentifier(node.expression) && node.expression.text === 'require'));
  return isLoad ? node.arguments[0] : undefined;
}

function scannedSources(file) {
  const sourceFile = ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    scriptKindOf(file),
  );
  const sources = [];
  function visit(node) {
    const source = nodeSource(node);
    if (source !== undefined && ts.isStringLiteralLike(source)) {
      sources.push(source.text);
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return sources;
}

const scanCache = new Map();

export function moduleSourcesOf(file) {
  return readStamped(scanCache, file, scannedSources) ?? [];
}
