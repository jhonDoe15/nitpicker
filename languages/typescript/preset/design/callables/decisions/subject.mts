import type TypeScript from 'typescript';
import { ts } from '../../syntax/typed.mts';
import { accessedName, declaredTypeOf, unwrap } from '../../syntax/nodes.mts';
import { entryOfNodeOrType } from '../../types/type-lookup.mts';
import { symbolOf } from '../scope.mts';
import type { Scope, TypeEntry } from '../../design-types.mts';

const OWNER_KINDS = new Set(['class', 'data', 'interface']);

function declaredTypeNode(
  scope: Scope,
  expression: TypeScript.Node,
): TypeScript.TypeNode | undefined {
  const identifier = ts.isPropertyAccessExpression(expression) ? expression.name : expression;
  const symbol = ts.isIdentifier(identifier) ? symbolOf(scope, identifier) : undefined;
  return declaredTypeOf(symbol?.valueDeclaration);
}

function receiverEntry(scope: Scope, receiver: TypeScript.Node): TypeEntry | undefined {
  if (receiver.kind === ts.SyntaxKind.ThisKeyword) {
    return scope.site.classEntry;
  }
  return entryOfNodeOrType(scope, {
    typeNode: declaredTypeNode(scope, receiver),
    type: scope.checker.getTypeAtLocation(receiver),
  });
}

function fieldSubject(
  scope: Scope,
  value: TypeScript.PropertyAccessExpression | TypeScript.ElementAccessExpression,
): string | undefined {
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

function enumSubject(
  scope: Scope,
  value: TypeScript.Node,
  constants: readonly string[],
): string | undefined {
  if (!constants.some((constant) => scope.registry.enumCases.has(constant))) {
    return undefined;
  }
  const entry = entryOfNodeOrType(scope, {
    typeNode: declaredTypeNode(scope, value),
    type: scope.checker.getTypeAtLocation(value),
  });
  return entry?.kind === 'enum' ? entry.id : undefined;
}

export function subjectOf(
  scope: Scope,
  expression: TypeScript.Node,
  constants: readonly string[],
): string | undefined {
  const value = unwrap(expression);
  if (!(
    ts.isIdentifier(value) ||
    ts.isPropertyAccessExpression(value) ||
    (ts.isElementAccessExpression(value) && ts.isStringLiteralLike(value.argumentExpression))
  )) {
    return undefined;
  }
  return (
    (ts.isIdentifier(value) ? undefined : fieldSubject(scope, value)) ??
    enumSubject(scope, value, constants)
  );
}
