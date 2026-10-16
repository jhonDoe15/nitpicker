import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { resolveModuleSpecifier } from '../../../modules/module-resolution.mjs';

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

function fileStamp(file) {
  const stats = statSync(file, { throwIfNoEntry: false });
  return stats === undefined ? undefined : `${String(stats.mtimeMs)}:${String(stats.size)}`;
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
  const stamp = fileStamp(file);
  if (stamp === undefined) return [];
  const cached = reexportCache.get(file);
  if (cached?.stamp === stamp) return cached.specifiers;
  const specifiers = scannedReexports(file);
  reexportCache.set(file, { stamp, specifiers });
  return specifiers;
}

function reachesReactTestModule(source, containingFile, visited) {
  if (isReactTestModule(source)) return true;
  const target = resolveModuleSpecifier(source, containingFile).path;
  if (target === undefined || visited.has(target) || visited.size >= MAX_FOLLOWED_MODULES) {
    return false;
  }
  visited.add(target);
  return (
    moduleNameOf(target).includes(TEST_UTILS_NAME) ||
    reexportsOf(target).some((reexported) => reachesReactTestModule(reexported, target, visited))
  );
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
  if (!path.isAbsolute(filename)) return false;
  const visited = new Set();
  return sources.some((source) => reachesReactTestModule(source, filename, visited));
}

export function inReactTestFilesOnly(create) {
  return (context) =>
    importsReactTestModule(context.sourceCode.ast, context.filename) ? create(context) : {};
}
