import { ts } from '../../typescript-api/typescript-api.mjs';
import { kindOfExpression, unwrapExpression } from './expressions.mjs';
import { KINDS } from './kinds.mjs';

function returnedExpression(fn) {
  if (fn.body === undefined || !ts.isBlock(fn.body)) {
    return fn.body;
  }
  const last = fn.body.statements.at(-1);
  return last !== undefined && ts.isReturnStatement(last) ? last.expression : undefined;
}

function isCallbackArgument(fn) {
  return (
    (ts.isArrowFunction(fn) || ts.isFunctionExpression(fn)) &&
    ts.isCallExpression(fn.parent) &&
    fn.parent.arguments.includes(fn)
  );
}

function expressionKind(expression) {
  if (expression === undefined) {
    return undefined;
  }
  if (ts.isObjectLiteralExpression(unwrapExpression(expression))) {
    return 'object';
  }
  return kindOfExpression(expression);
}

function untypedKind(declaration) {
  if (ts.isFunctionLike(declaration)) {
    return isCallbackArgument(declaration)
      ? 'callback'
      : expressionKind(returnedExpression(declaration));
  }
  if (ts.isBindingElement(declaration) && declaration.dotDotDotToken !== undefined) {
    return 'rest';
  }
  const initialized =
    ts.isVariableDeclaration(declaration) ||
    ts.isPropertyDeclaration(declaration) ||
    ts.isParameter(declaration);
  return initialized ? expressionKind(declaration.initializer) : undefined;
}

export function untypedFinding(declaration) {
  const kind = untypedKind(declaration);
  return kind === undefined ? undefined : { kind, label: KINDS[kind].label };
}

export function typeParameterFinding(declaration, sourceFile) {
  const name = declaration.type?.typeName?.getText(sourceFile);
  const owner = declaration.parent;
  const declared = ts.isFunctionLike(owner) ? (owner.typeParameters ?? []) : [];
  return ts.isParameter(declaration) && declared.some((parameter) => parameter.name.text === name)
    ? { kind: 'typeParameter', label: KINDS.typeParameter.label }
    : undefined;
}
