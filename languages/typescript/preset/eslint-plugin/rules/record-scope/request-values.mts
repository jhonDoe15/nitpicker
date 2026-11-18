import type TypeScript from 'typescript';
import { ts } from '../typed/typescript-views.mts';

const REQUEST_NAME = /^(?:command|dto|input|body|params|req|request|payload)$/iu;
const REQUEST_TYPE = /(?:Command|Dto|DTO|Input|Request|Body|Params|Payload)(?:<[^>]*>)?(?:\[\])?$/u;
const REQUEST_DECORATORS = /^@(?:Param|Body|Query|Req|Request)\b/u;
const COERCIONS = new Set(['String', 'Number', 'parseInt', 'Boolean']);
const MAX_DEPTH = 4;

function withoutWrappers(expression: TypeScript.Expression): TypeScript.Expression {
  let current = expression;
  for (;;) {
    if (
      ts.isParenthesizedExpression(current) ||
      ts.isNonNullExpression(current) ||
      ts.isAsExpression(current) ||
      ts.isAwaitExpression(current)
    ) {
      current = current.expression;
    } else if (
      ts.isCallExpression(current) &&
      ts.isIdentifier(current.expression) &&
      COERCIONS.has(current.expression.text) &&
      current.arguments[0] !== undefined
    ) {
      current = current.arguments[0];
    } else {
      return current;
    }
  }
}

function rootIdentifier(expression: TypeScript.Expression): TypeScript.Identifier | undefined {
  let current = withoutWrappers(expression);
  while (ts.isPropertyAccessExpression(current) || ts.isElementAccessExpression(current)) {
    current = withoutWrappers(current.expression);
  }
  return ts.isIdentifier(current) ? current : undefined;
}

function isRequestParameter(
  parameter: TypeScript.ParameterDeclaration,
  sourceFile: TypeScript.SourceFile,
): boolean {
  const decorated = (ts.getDecorators(parameter) ?? []).some((decorator) =>
    REQUEST_DECORATORS.test(decorator.getText(sourceFile)),
  );
  const named = ts.isIdentifier(parameter.name) && REQUEST_NAME.test(parameter.name.text);
  const typed =
    parameter.type !== undefined && REQUEST_TYPE.test(parameter.type.getText(sourceFile));
  return decorated || named || typed;
}

type Scope = {
  readonly checker: TypeScript.TypeChecker;
  readonly sourceFile: TypeScript.SourceFile;
};

function fromDeclaration(
  declaration: TypeScript.Declaration | undefined,
  scope: Scope,
  depth: number,
): boolean {
  if (declaration === undefined || depth > MAX_DEPTH) {
    return false;
  }
  if (ts.isParameter(declaration)) {
    return isRequestParameter(declaration, scope.sourceFile);
  }
  if (ts.isBindingElement(declaration)) {
    const names = [declaration.name, declaration.propertyName].filter(
      (name): name is TypeScript.BindingName | TypeScript.PropertyName => name !== undefined,
    );
    const container = declaration.parent.parent;
    return (
      names.some((name) => ts.isIdentifier(name) && REQUEST_NAME.test(name.text)) ||
      fromDeclaration(container, scope, depth + 1)
    );
  }
  return (
    ts.isVariableDeclaration(declaration) &&
    declaration.initializer !== undefined &&
    isFromRequest(declaration.initializer, scope, depth + 1)
  );
}

export function isFromRequest(expression: TypeScript.Expression, scope: Scope, depth = 0): boolean {
  const root = rootIdentifier(expression);
  const shorthand = root !== undefined && ts.isShorthandPropertyAssignment(root.parent);
  const symbol =
    root === undefined
      ? undefined
      : shorthand
        ? scope.checker.getShorthandAssignmentValueSymbol(root.parent)
        : scope.checker.getSymbolAtLocation(root);
  const declaration = symbol?.valueDeclaration;
  return fromDeclaration(declaration, scope, depth);
}
