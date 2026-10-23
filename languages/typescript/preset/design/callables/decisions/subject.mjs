import ts from 'typescript';
import { accessedName, unwrap } from '../../syntax/nodes.mjs';
import { entryOfNodeOrType } from '../../types/type-lookup.mjs';
import { symbolOf } from '../scope.mjs';

const OWNER_KINDS = new Set(['class', 'data', 'interface']);

function declaredTypeNode(scope, expression) {
  const identifier = ts.isPropertyAccessExpression(expression) ? expression.name : expression;
  const symbol = ts.isIdentifier(identifier) ? symbolOf(scope, identifier) : undefined;
  return symbol?.valueDeclaration?.type;
}

function receiverEntry(scope, receiver) {
  if (receiver.kind === ts.SyntaxKind.ThisKeyword) {
    return scope.site.classEntry;
  }
  return entryOfNodeOrType(scope, {
    typeNode: declaredTypeNode(scope, receiver),
    type: scope.checker.getTypeAtLocation(receiver),
  });
}

function fieldSubject(scope, value) {
  const name = accessedName(value);
  if (name === undefined || !scope.registry.fieldNames.has(name)) {
    return undefined;
  }
  const entry = receiverEntry(scope, unwrap(value.expression));
  const declaration = scope.checker.getSymbolAtLocation(
    ts.isPropertyAccessExpression(value) ? value.name : value.argumentExpression,
  )?.valueDeclaration;
  const isField =
    declaration !== undefined &&
    (ts.isPropertyDeclaration(declaration) ||
      ts.isPropertySignature(declaration) ||
      ts.isParameter(declaration) ||
      ts.isBinaryExpression(declaration) ||
      ts.isPropertyAccessExpression(declaration));
  return entry !== undefined && OWNER_KINDS.has(entry.kind) && isField
    ? `${entry.id}.${name}`
    : undefined;
}

function enumSubject(scope, value, constants) {
  if (!constants.some((constant) => scope.registry.enumCases.has(constant))) {
    return undefined;
  }
  const entry = entryOfNodeOrType(scope, {
    typeNode: declaredTypeNode(scope, value),
    type: scope.checker.getTypeAtLocation(value),
  });
  return entry?.kind === 'enum' ? entry.id : undefined;
}

export function subjectOf(scope, expression, constants) {
  const value = unwrap(expression);
  const isValue =
    ts.isIdentifier(value) ||
    ts.isPropertyAccessExpression(value) ||
    (ts.isElementAccessExpression(value) && ts.isStringLiteralLike(value.argumentExpression));
  if (!isValue) {
    return undefined;
  }
  return (
    (ts.isIdentifier(value) ? undefined : fieldSubject(scope, value)) ??
    enumSubject(scope, value, constants)
  );
}
