import type TypeScript from 'typescript';
import { ts } from '../../typed/typescript-views.mts';

export type ImportBinding = {
  readonly source?: string | undefined;
  readonly imported?: string | undefined;
};
export function nameOf(node: TypeScript.Node | undefined): string | undefined {
  if (node === undefined) {
    return undefined;
  }
  if (ts.isIdentifier(node) || ts.isPrivateIdentifier(node)) {
    return node.text;
  }
  return ts.isStringLiteralLike(node) || ts.isNumericLiteral(node) ? node.text : undefined;
}

function moduleText(specifier: TypeScript.Expression | undefined): string | undefined {
  return specifier !== undefined && ts.isStringLiteral(specifier) ? specifier.text : undefined;
}

function importedName(
  clause: TypeScript.ImportClause,
  name: string,
): { readonly imported: string } | undefined {
  if (clause.name?.text === name) {
    return { imported: 'default' };
  }
  const bindings = clause.namedBindings;
  if (bindings !== undefined && ts.isNamespaceImport(bindings)) {
    return bindings.name.text === name ? { imported: '*' } : undefined;
  }
  const element = bindings?.elements.find((entry) => entry.name.text === name);
  return element === undefined
    ? undefined
    : { imported: (element.propertyName ?? element.name).text };
}

function requiredName(
  declaration: TypeScript.VariableDeclaration,
  name: string,
): ImportBinding | undefined {
  const call = declaration.initializer;
  const isRequire =
    call !== undefined &&
    ts.isCallExpression(call) &&
    ts.isIdentifier(call.expression) &&
    call.expression.text === 'require';
  if (!isRequire) {
    return undefined;
  }
  const source = moduleText(call.arguments[0]);
  if (ts.isIdentifier(declaration.name)) {
    return declaration.name.text === name ? { source, imported: '*' } : undefined;
  }
  const element = ts.isObjectBindingPattern(declaration.name)
    ? declaration.name.elements.find((entry) => nameOf(entry.name) === name)
    : undefined;
  return element === undefined
    ? undefined
    : { source, imported: nameOf(element.propertyName ?? element.name) };
}

function statementBinding(
  statement: TypeScript.Statement,
  name: string,
): ImportBinding | undefined {
  if (ts.isImportDeclaration(statement) && statement.importClause !== undefined) {
    const found = importedName(statement.importClause, name);
    return found === undefined
      ? undefined
      : { source: moduleText(statement.moduleSpecifier), ...found };
  }
  if (!ts.isVariableStatement(statement)) {
    return undefined;
  }
  return statement.declarationList.declarations
    .map((declaration) => requiredName(declaration, name))
    .find((found) => found !== undefined);
}

export function topLevelImport(
  file: TypeScript.SourceFile,
  name: string,
): ImportBinding | undefined {
  for (const statement of file.statements) {
    const binding = statementBinding(statement, name);
    if (binding !== undefined) {
      return binding;
    }
  }
  return undefined;
}
