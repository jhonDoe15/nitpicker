import { readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { resolveModuleSpecifier } from '../../../modules/module-resolution.mjs';
import { readStamped } from '../../../modules/stamped-file-cache.mjs';

const reactTestModule = /^(?:@testing-library\/.+|react(?:-[^/]+)?(?:\/.*)?|enzyme(?:\/.*)?)$/;
const projectTestUtilsModule = /^\.{1,2}\/(?:.*\/)?[^/]*test-utils[^/]*$/;
const TEST_UTILS_NAME = 'test-utils';
const MAX_FOLLOWED_MODULES = 50;

const reexportCache = new Map();

function isReactTestModule(source) {
  return reactTestModule.test(source) || projectTestUtilsModule.test(source);
}

function moduleNameOf(file) {
  const base = path.basename(file).replace(/\.[^.]+$/u, '');
  return base === 'index' ? path.basename(path.dirname(file)) : base;
}

function scannedReexports(file) {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest);
  return source.statements
    .filter((statement) => ts.isExportDeclaration(statement))
    .map(({ moduleSpecifier }) => moduleSpecifier)
    .filter((specifier) => specifier !== undefined && ts.isStringLiteral(specifier))
    .map(({ text }) => text);
}

function reexportsOf(file) {
  return readStamped(reexportCache, file, scannedReexports) ?? [];
}

function isTestUtilsModule(file) {
  return moduleNameOf(file).includes(TEST_UTILS_NAME);
}

function unvisitedTarget(source, from, visited) {
  const target = resolveModuleSpecifier(source, from).path;
  const fresh = target !== undefined && !visited.has(target);
  return fresh && visited.size < MAX_FOLLOWED_MODULES ? target : undefined;
}

function reachesReactTestModule(sources, filename) {
  const visited = new Set();
  const pending = sources.map((source) => ({ source, from: filename }));
  for (const { source, from } of pending) {
    const target = unvisitedTarget(source, from, visited);
    if (target === undefined) continue;
    visited.add(target);
    const reexported = reexportsOf(target);
    if (isTestUtilsModule(target) || reexported.some(isReactTestModule)) return true;
    pending.push(...reexported.map((next) => ({ source: next, from: target })));
  }
  return false;
}

function requiredSource(node) {
  const isRequire =
    node?.type === 'CallExpression' &&
    node.callee.type === 'Identifier' &&
    node.callee.name === 'require';
  const [argument] = isRequire ? node.arguments : [];
  return argument?.type === 'Literal' ? argument.value : undefined;
}

function statementSources(statement) {
  switch (statement.type) {
    case 'ImportDeclaration':
    case 'ExportNamedDeclaration':
    case 'ExportAllDeclaration':
      return [statement.source?.value];
    case 'TSImportEqualsDeclaration':
      return [statement.moduleReference.expression?.value];
    case 'ExpressionStatement':
      return [requiredSource(statement.expression)];
    case 'VariableDeclaration':
      return statement.declarations.map((declarator) => requiredSource(declarator.init));
    default:
      return [];
  }
}

function importsReactTestModule(program, filename) {
  const sources = program.body
    .flatMap(statementSources)
    .filter((source) => typeof source === 'string');
  if (sources.some(isReactTestModule)) return true;
  return path.isAbsolute(filename) && reachesReactTestModule(sources, filename);
}

export function inReactTestFilesOnly(create) {
  return (context) =>
    importsReactTestModule(context.sourceCode.ast, context.filename) ? create(context) : {};
}
