import { readFileSync } from 'node:fs';
import type TypeScript from 'typescript';
import { ts } from '../../typed/typescript-views.mts';
import {
  isExported,
  readStamped,
  scriptKindOf,
  type StampedCache,
} from '../support/typed-sources.mts';

function hasModifier(node: TypeScript.Node, modifier: TypeScript.SyntaxKind): boolean {
  return (
    ts.canHaveModifiers(node) &&
    (ts.getModifiers(node)?.some(({ kind }) => kind === modifier) ?? false)
  );
}

function isAsync(node: TypeScript.Node): boolean {
  return hasModifier(node, ts.SyntaxKind.AsyncKeyword);
}

function asyncNamesOf(statement: TypeScript.Statement): string[] {
  if (ts.isFunctionDeclaration(statement)) {
    const name = hasModifier(statement, ts.SyntaxKind.DefaultKeyword)
      ? 'default'
      : statement.name?.text;
    return isAsync(statement) && name !== undefined ? [name] : [];
  }
  const declarations = ts.isVariableStatement(statement)
    ? statement.declarationList.declarations
    : [];
  return declarations.flatMap(({ name, initializer }) =>
    ts.isIdentifier(name) &&
    initializer !== undefined &&
    (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer)) &&
    isAsync(initializer)
      ? [name.text]
      : [],
  );
}

function asyncExports(file: string): Set<string> {
  const sourceFile = ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    scriptKindOf(file),
  );
  return new Set(sourceFile.statements.filter(isExported).flatMap(asyncNamesOf));
}

const exportCache: StampedCache<Set<string>> = new Map();

export function exportIsAsyncFunction(file: string, name: string): boolean {
  return readStamped(exportCache, file, asyncExports)?.has(name) ?? false;
}
