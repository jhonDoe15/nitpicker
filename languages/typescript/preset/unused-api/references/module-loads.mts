import path from 'node:path';
import type TypeScript from 'typescript';
import { typescriptApi } from '../../../adapters/typed/typescript-program.mts';
import type { ReferenceState } from '../typed/context-types.mts';
import { escapeModule } from './state.mts';

const ts = typescriptApi();
const GLOB_IMPORTS = new Set(['glob', 'globEager']);

function isImportMetaGlob(callee: TypeScript.Node): boolean {
  return (
    ts.isPropertyAccessExpression(callee) &&
    ts.isMetaProperty(callee.expression) &&
    GLOB_IMPORTS.has(callee.name.text)
  );
}

export function isModuleLoad(callee: TypeScript.Node): boolean {
  return (
    callee.kind === ts.SyntaxKind.ImportKeyword ||
    (ts.isIdentifier(callee) && callee.text === 'require') ||
    isImportMetaGlob(callee)
  );
}

function escapeFiles(state: ReferenceState, matches: (fileName: string) => boolean): void {
  for (const sourceFile of state.files.filter((file) => matches(file.fileName))) {
    escapeModule(state.checker.getSymbolAtLocation(sourceFile), state);
  }
}

function relativeTo(state: ReferenceState, specifier: string): string {
  return path.posix.join(path.posix.dirname(state.sourceFile.fileName), specifier);
}

function escapeTemplate(template: TypeScript.TemplateExpression, state: ReferenceState): void {
  const prefix = template.head.text;
  if (!prefix.startsWith('.')) return;
  const directory = relativeTo(state, prefix);
  escapeFiles(state, (fileName) => fileName.startsWith(directory));
}

function globPatterns(argument: TypeScript.Expression | undefined): string[] {
  if (argument === undefined) return [];
  if (ts.isStringLiteralLike(argument)) return [argument.text];
  return ts.isArrayLiteralExpression(argument)
    ? argument.elements.filter(ts.isStringLiteralLike).map(({ text }) => text)
    : [];
}

function escapeGlob(call: TypeScript.CallExpression, state: ReferenceState): void {
  const patterns = globPatterns(call.arguments[0])
    .filter((pattern) => pattern.startsWith('.'))
    .map((pattern) => relativeTo(state, pattern));
  escapeFiles(state, (fileName) =>
    patterns.some((pattern) => path.posix.matchesGlob(fileName, pattern)),
  );
}

export function handleModuleLoad(
  call: TypeScript.CallExpression,
  callee: TypeScript.Node,
  state: ReferenceState,
): void {
  const [specifier] = call.arguments;
  const isGlob = isImportMetaGlob(callee);
  const isTemplate = specifier !== undefined && ts.isTemplateExpression(specifier);
  const isLiteral = specifier !== undefined && ts.isStringLiteralLike(specifier);
  if (isGlob) escapeGlob(call, state);
  if (!isGlob && isTemplate) escapeTemplate(specifier, state);
  if (!isGlob && isLiteral) escapeModule(state.checker.getSymbolAtLocation(specifier), state);
}
