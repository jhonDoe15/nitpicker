import ts from 'typescript';
import { accessedName, enclosingClosure, unwrapValue } from '../../syntax/nodes.mjs';
import { isOwnerThis, symbolOf } from '../scope.mjs';

function ownerEntry(scope) {
  return scope.registry.typeIds.get(scope.site.owner);
}

function isModuleVariable(declaration, scope) {
  return (
    declaration !== undefined &&
    ts.isVariableDeclaration(declaration) &&
    declaration.getSourceFile() === scope.sourceFile &&
    enclosingClosure(declaration) === undefined
  );
}

export function ownFieldOf(scope, node) {
  const owner = ownerEntry(scope);
  if (owner === undefined) {
    return undefined;
  }
  if (owner.kind === 'module') {
    const candidate = ts.isIdentifier(node) && owner.fieldNames.has(node.text);
    const declaration = candidate ? symbolOf(scope, node)?.valueDeclaration : undefined;
    return isModuleVariable(declaration, scope) ? node.text : undefined;
  }
  const isThisMember =
    (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) &&
    node.expression.kind === ts.SyntaxKind.ThisKeyword &&
    isOwnerThis(scope, node.expression);
  const name = isThisMember ? accessedName(node) : undefined;
  return name !== undefined && owner.fieldNames.has(name) ? name : undefined;
}

function destructuredFields(scope, node) {
  const isThisPattern =
    ts.isVariableDeclaration(node) &&
    ts.isObjectBindingPattern(node.name) &&
    node.initializer !== undefined &&
    unwrapValue(node.initializer).kind === ts.SyntaxKind.ThisKeyword &&
    isOwnerThis(scope, unwrapValue(node.initializer));
  const owner = ownerEntry(scope);
  return isThisPattern && owner?.fieldNames !== undefined
    ? node.name.elements
        .map((element) => (element.propertyName ?? element.name).getText())
        .filter((name) => owner.fieldNames.has(name))
    : [];
}

export function ownFieldNames(scope) {
  const names = new Set();
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

export function returnedField(scope) {
  const { node } = scope.site;
  const returned = ts.isBlock(node.body)
    ? scope.nodes
        .filter(
          (candidate) => ts.isReturnStatement(candidate) && enclosingClosure(candidate) === node,
        )
        .map((statement) => statement.expression)
    : [node.body];
  for (const expression of returned) {
    const name = expression === undefined ? undefined : ownFieldOf(scope, unwrapValue(expression));
    if (name !== undefined) {
      return name;
    }
  }
  return undefined;
}
