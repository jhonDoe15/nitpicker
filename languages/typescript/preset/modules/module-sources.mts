import { readFileSync } from 'node:fs';
import type { TSESTree } from '@typescript-eslint/utils';
import { hasKind } from '../syntax/kinds/node-kinds.mts';
import type TypeScript from 'typescript';
import { ts } from '../../typescript-api/typescript-api.mts';
import { readStamped } from './stamped-file-cache.mts';
import type { ModuleReference, StampedEntry } from './typed/module-types.mts';

type NodeReference = {
  readonly source: TypeScript.Node | undefined;
  readonly runtime: boolean;
  readonly reexport?: true;
};

export function isExported(statement: TypeScript.Node): boolean {
  return (
    (ts.canHaveModifiers(statement) &&
      ts.getModifiers(statement)?.some(({ kind }) => kind === ts.SyntaxKind.ExportKeyword)) ||
    false
  );
}

function literalSource(node: TSESTree.Node | undefined): string | undefined {
  return hasKind(node, 'Literal') && typeof node.value === 'string' ? node.value : undefined;
}

function requiredSource(node: TSESTree.CallExpression): string | undefined {
  const isRequire = hasKind(node.callee, 'Identifier') && node.callee.name === 'require';
  return isRequire ? literalSource(node.arguments[0]) : undefined;
}

export function moduleSourceOf(node: TSESTree.Node): string | undefined {
  if (
    hasKind(node, 'ImportDeclaration') ||
    hasKind(node, 'ImportExpression') ||
    hasKind(node, 'ExportNamedDeclaration') ||
    hasKind(node, 'ExportAllDeclaration')
  ) {
    return literalSource(node.source ?? undefined);
  }
  if (hasKind(node, 'TSImportEqualsDeclaration')) {
    return hasKind(node.moduleReference, 'TSExternalModuleReference')
      ? literalSource(node.moduleReference.expression)
      : undefined;
  }
  return hasKind(node, 'CallExpression') ? requiredSource(node) : undefined;
}

function topLevelRequires(statement: TSESTree.Node): TSESTree.Node[] {
  if (hasKind(statement, 'ExpressionStatement')) {
    return [statement.expression];
  }
  return hasKind(statement, 'VariableDeclaration')
    ? statement.declarations.map(({ init }) => init).filter((init) => init !== null)
    : [];
}

export function statementSources(statement: TSESTree.Node): string[] {
  return [statement, ...topLevelRequires(statement)]
    .map(moduleSourceOf)
    .filter((source) => source !== undefined);
}

export function scriptKindOf(file: string): TypeScript.ScriptKind {
  return /\.[jt]sx$/u.test(file) ? ts.ScriptKind.TSX : ts.ScriptKind.Unknown;
}

function isTypeOnlyClause(clause: TypeScript.ImportClause): boolean {
  const typeOnly: unknown = Reflect.get(clause, 'isTypeOnly');
  return typeOnly === true;
}

function importsAtRuntime(clause: TypeScript.ImportClause | undefined): boolean {
  const named = clause?.namedBindings;
  if (clause === undefined || named === undefined || clause.name !== undefined) {
    return clause === undefined || !isTypeOnlyClause(clause);
  }
  return (
    !isTypeOnlyClause(clause) &&
    (ts.isNamespaceImport(named) ||
      named.elements.length === 0 ||
      named.elements.some((element) => !element.isTypeOnly))
  );
}

function exportsAtRuntime(statement: TypeScript.ExportDeclaration): boolean {
  const clause = statement.exportClause;
  return (
    !statement.isTypeOnly &&
    (clause === undefined ||
      !ts.isNamedExports(clause) ||
      clause.elements.some((element) => !element.isTypeOnly))
  );
}

function nodeReference(node: TypeScript.Node): NodeReference | undefined {
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

function scannedReferences(file: string): ModuleReference[] {
  const sourceFile = ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    scriptKindOf(file),
  );
  const references: ModuleReference[] = [];
  function visit(node: TypeScript.Node): void {
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

const scanCache = new Map<string, StampedEntry<ModuleReference[]>>();

export function moduleReferencesOf(file: string): ModuleReference[] {
  return readStamped(scanCache, file, scannedReferences) ?? [];
}

export function moduleSourcesOf(file: string): string[] {
  return moduleReferencesOf(file).map(({ source }) => source);
}
