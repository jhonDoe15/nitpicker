import type TypeScript from 'typescript';
import { typescriptApi } from '../typed/typescript-program.mts';
import { kindOfExpression, unwrapExpression } from './expressions.mts';
import { type Kind, KINDS } from './kinds.mts';

export type Declaration =
  | TypeScript.VariableDeclaration
  | TypeScript.BindingElement
  | TypeScript.ParameterDeclaration
  | TypeScript.SignatureDeclaration
  | TypeScript.PropertyDeclaration
  | TypeScript.PropertySignature;

export type KindFinding = { readonly kind: Kind; readonly label: string };

const ts = typescriptApi();

function returnedExpression(
  fn: TypeScript.SignatureDeclaration,
): TypeScript.Expression | undefined {
  const body = 'body' in fn ? fn.body : undefined;
  if (body === undefined || !ts.isBlock(body)) {
    return body;
  }
  const last = body.statements.at(-1);
  return last !== undefined && ts.isReturnStatement(last) ? last.expression : undefined;
}

function isCallbackArgument(fn: TypeScript.SignatureDeclaration): boolean {
  return (
    (ts.isArrowFunction(fn) || ts.isFunctionExpression(fn)) &&
    ts.isCallExpression(fn.parent) &&
    fn.parent.arguments.includes(fn)
  );
}

function expressionKind(expression: TypeScript.Expression | undefined): Kind | undefined {
  if (expression === undefined) {
    return undefined;
  }
  if (ts.isObjectLiteralExpression(unwrapExpression(expression))) {
    return 'object';
  }
  return kindOfExpression(expression);
}

function untypedKind(declaration: Declaration): Kind | undefined {
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

export function untypedFinding(declaration: Declaration): KindFinding | undefined {
  const kind = untypedKind(declaration);
  return kind === undefined ? undefined : { kind, label: KINDS[kind].label };
}

export function typeParameterFinding(
  declaration: Declaration,
  sourceFile: TypeScript.SourceFile,
): KindFinding | undefined {
  const typeNode = 'type' in declaration ? declaration.type : undefined;
  const name =
    typeNode !== undefined && ts.isTypeReferenceNode(typeNode)
      ? typeNode.typeName.getText(sourceFile)
      : undefined;
  const owner = declaration.parent;
  const declared = ts.isFunctionLike(owner) ? (owner.typeParameters ?? []) : [];
  return ts.isParameter(declaration) && declared.some((parameter) => parameter.name.text === name)
    ? { kind: 'typeParameter', label: KINDS.typeParameter.label }
    : undefined;
}
