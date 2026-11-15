import type { Expression, Node } from 'typescript';
import { ts } from '../../syntax/typed.mts';
import { accessedName, enclosingClosure, unwrapValue } from '../../syntax/nodes.mts';
import { isOwnerThis, symbolOf } from '../scope.mts';
import type { Scope, TypeEntry } from '../../design-types.mts';

function ownerEntry(scope: Scope): TypeEntry | undefined {
  return scope.registry.typeIds.get(scope.site.owner ?? '');
}

function isModuleVariable(declaration: Node | undefined, scope: Scope): boolean {
  return (
    declaration !== undefined &&
    ts.isVariableDeclaration(declaration) &&
    declaration.getSourceFile() === scope.sourceFile &&
    enclosingClosure(declaration) === undefined
  );
}

export function ownFieldOf(scope: Scope, node: Node): string | undefined {
  const owner = ownerEntry(scope);
  if (owner === undefined) {
    return undefined;
  }
  if (owner.kind === 'module') {
    const candidate = ts.isIdentifier(node) && owner.fieldNames.has(node.text);
    const declaration = candidate ? symbolOf(scope, node)?.valueDeclaration : undefined;
    return isModuleVariable(declaration, scope) && ts.isIdentifier(node) ? node.text : undefined;
  }
  const isThisMember =
    (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) &&
    node.expression.kind === ts.SyntaxKind.ThisKeyword &&
    isOwnerThis(scope, node.expression);
  const name = isThisMember ? accessedName(node) : undefined;
  return name !== undefined && owner.fieldNames.has(name) ? name : undefined;
}

function destructuredFields(scope: Scope, node: Node): string[] {
  const isThisPattern =
    ts.isVariableDeclaration(node) &&
    ts.isObjectBindingPattern(node.name) &&
    node.initializer !== undefined &&
    unwrapValue(node.initializer).kind === ts.SyntaxKind.ThisKeyword &&
    isOwnerThis(scope, unwrapValue(node.initializer));
  const owner = ownerEntry(scope);
  return isThisPattern && owner !== undefined
    ? node.name.elements
        .map((element) => (element.propertyName ?? element.name).getText())
        .filter((name) => owner.fieldNames.has(name))
    : [];
}

export function ownFieldNames(scope: Scope): string[] {
  const names = new Set<string>();
  for (const node of scope.nodes) {
    const name = ownFieldOf(scope, node);
    if (name !== undefined) {
      names.add(name);
    }
    for (const field of destructuredFields(scope, node)) {
      names.add(field);
    }
  }
  return [...names];
}

export function returnedField(scope: Scope): string | undefined {
  const { node } = scope.site;
  const body = 'body' in node ? node.body : undefined;
  const returned: (Expression | undefined)[] =
    body !== undefined && ts.isBlock(body)
      ? scope.nodes
          .filter(ts.isReturnStatement)
          .filter((statement) => enclosingClosure(statement) === node)
          .map((statement) => statement.expression)
      : [body];
  for (const expression of returned) {
    const name = expression === undefined ? undefined : ownFieldOf(scope, unwrapValue(expression));
    if (name !== undefined) {
      return name;
    }
  }
  return undefined;
}
