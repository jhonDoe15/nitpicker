import path from 'node:path';
import ts from 'typescript';
import { escapeModule } from './state.mjs';

const GLOB_IMPORTS = new Set(['glob', 'globEager']);

function isImportMetaGlob(callee) {
  return (
    ts.isPropertyAccessExpression(callee) &&
    ts.isMetaProperty(callee.expression) &&
    GLOB_IMPORTS.has(callee.name.text)
  );
}

/** `import()`, `require()` and Vite's `import.meta.glob()`. */
export function isModuleLoad(callee) {
  return (
    callee.kind === ts.SyntaxKind.ImportKeyword ||
    (ts.isIdentifier(callee) && callee.text === 'require') ||
    isImportMetaGlob(callee)
  );
}

function escapeFiles(state, matches) {
  for (const sourceFile of state.files.filter((file) => matches(file.fileName))) {
    escapeModule(state.checker.getSymbolAtLocation(sourceFile), state);
  }
}

function relativeTo(state, specifier) {
  return path.posix.join(path.posix.dirname(state.sourceFile.fileName), specifier);
}

function escapeTemplate(template, state) {
  const prefix = template.head.text;
  if (!prefix.startsWith('.')) return;
  const directory = relativeTo(state, prefix);
  escapeFiles(state, (fileName) => fileName.startsWith(directory));
}

function globPatterns(argument) {
  if (argument === undefined) return [];
  if (ts.isStringLiteralLike(argument)) return [argument.text];
  return ts.isArrayLiteralExpression(argument)
    ? argument.elements.filter(ts.isStringLiteralLike).map(({ text }) => text)
    : [];
}

function escapeGlob(call, state) {
  const patterns = globPatterns(call.arguments[0])
    .filter((pattern) => pattern.startsWith('.'))
    .map((pattern) => relativeTo(state, pattern));
  escapeFiles(state, (fileName) =>
    patterns.some((pattern) => path.posix.matchesGlob(fileName, pattern)),
  );
}

/**
 * A module loaded at run time lets every export escape: a literal specifier names one module, a
 * template literal every module under its static prefix, and `import.meta.glob` every match.
 */
export function handleModuleLoad(call, callee, state) {
  const [specifier] = call.arguments;
  const isGlob = isImportMetaGlob(callee);
  const isTemplate = specifier !== undefined && ts.isTemplateExpression(specifier);
  const isLiteral = specifier !== undefined && ts.isStringLiteralLike(specifier);
  if (isGlob) escapeGlob(call, state);
  if (!isGlob && isTemplate) escapeTemplate(specifier, state);
  if (!isGlob && isLiteral) escapeModule(state.checker.getSymbolAtLocation(specifier), state);
}
