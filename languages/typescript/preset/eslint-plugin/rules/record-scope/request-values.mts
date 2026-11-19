import type TypeScript from 'typescript';
import { innermostExpression, ts } from '../typed/typescript-views.mts';

const REQUEST_NAME = /^(?:command|dto|input|body|params|req|request|payload)$/iu;
const REQUEST_TYPE = /(?:Command|Dto|DTO|Input|Request|Body|Params|Payload)(?:<[^>]*>)?(?:\[\])?$/u;
const REQUEST_DECORATORS = /^@(?:Param|Body|Query|Req|Request)\b/u;
const COERCIONS = new Set(['String', 'Number', 'parseInt', 'Boolean']);
const MAX_DEPTH = 4;

function coercedArgument(expression: TypeScript.Expression): TypeScript.Expression | undefined {
  return ts.isCallExpression(expression) &&
    ts.isIdentifier(expression.expression) &&
    COERCIONS.has(expression.expression.text)
    ? expression.arguments[0]
    : undefined;
}

function withoutWrappers(expression: TypeScript.Expression): TypeScript.Expression {
  return innermostExpression(expression, coercedArgument);
}

function rootIdentifier(expression: TypeScript.Expression): TypeScript.Identifier | undefined {
  const chain = [withoutWrappers(expression)];
  for (const current of chain) {
    if (ts.isPropertyAccessExpression(current) || ts.isElementAccessExpression(current)) {
      chain.push(withoutWrappers(current.expression));
    }
  }
  const root = chain.at(-1);
  return root !== undefined && ts.isIdentifier(root) ? root : undefined;
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

function declarationOf(
  expression: TypeScript.Expression,
  scope: Scope,
): TypeScript.Declaration | undefined {
  const root = rootIdentifier(expression);
  if (root === undefined) {
    return undefined;
  }
  const symbol = ts.isShorthandPropertyAssignment(root.parent)
    ? scope.checker.getShorthandAssignmentValueSymbol(root.parent)
    : scope.checker.getSymbolAtLocation(root);
  return symbol?.valueDeclaration;
}

function nextDeclaration(
  declaration: TypeScript.Declaration,
  scope: Scope,
): boolean | TypeScript.Declaration | undefined {
  if (ts.isParameter(declaration)) {
    return isRequestParameter(declaration, scope.sourceFile);
  }
  if (ts.isBindingElement(declaration)) {
    const names = [declaration.name, declaration.propertyName].filter(
      (name): name is TypeScript.BindingName | TypeScript.PropertyName => name !== undefined,
    );
    return names.some((name) => ts.isIdentifier(name) && REQUEST_NAME.test(name.text))
      ? true
      : declaration.parent.parent;
  }
  return ts.isVariableDeclaration(declaration) && declaration.initializer !== undefined
    ? declarationOf(declaration.initializer, scope)
    : false;
}

export function isFromRequest(expression: TypeScript.Expression, scope: Scope): boolean {
  const pending = [{ declaration: declarationOf(expression, scope), depth: 0 }];
  for (const { declaration, depth } of pending) {
    if (declaration === undefined || depth > MAX_DEPTH) {
      return false;
    }
    const next = nextDeclaration(declaration, scope);
    if (typeof next === 'boolean') {
      return next;
    }
    pending.push({ declaration: next, depth: depth + 1 });
  }
  return false;
}
