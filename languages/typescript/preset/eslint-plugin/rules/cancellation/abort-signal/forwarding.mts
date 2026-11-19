import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import type TypeScript from 'typescript';
import { partsOf } from '../../analysis/narrowing/type-parts.mts';
import { ts } from '../../typed/typescript-views.mts';
import { isSignalType } from './signal-scope.mts';

const SIGNAL = 'signal';
const NOTHING = ts.TypeFlags.Null | ts.TypeFlags.Undefined | ts.TypeFlags.Void;

function hasSignalProperty(checker: TypeScript.TypeChecker, type: TypeScript.Type): boolean {
  return partsOf(type)
    .filter((part) => (part.flags & NOTHING) === 0)
    .some((part) => {
      const property = part.getProperty(SIGNAL);
      const declaration = property?.valueDeclaration ?? property?.declarations?.[0];
      return (
        property !== undefined &&
        declaration !== undefined &&
        isSignalType(checker.getTypeOfSymbolAtLocation(property, declaration))
      );
    });
}

function suppliesSignal(argument: TSESTree.CallExpressionArgument | undefined): boolean {
  if (argument === undefined) {
    return false;
  }
  if (argument.type !== AST_NODE_TYPES.ObjectExpression) {
    return true;
  }
  return argument.properties.some(
    (property) =>
      property.type === AST_NODE_TYPES.SpreadElement ||
      (!property.computed &&
        ((property.key.type === AST_NODE_TYPES.Identifier && property.key.name === SIGNAL) ||
          (property.key.type === AST_NODE_TYPES.Literal && property.key.value === SIGNAL))),
  );
}

export function unforwardedParameter(
  checker: TypeScript.TypeChecker,
  tsCall: TypeScript.CallExpression,
  call: TSESTree.CallExpression,
): string | undefined {
  const signature = checker.getResolvedSignature(tsCall);
  if (
    signature === undefined ||
    call.arguments.some((argument) => argument.type === AST_NODE_TYPES.SpreadElement)
  ) {
    return undefined;
  }
  const parameters = signature.getParameters();
  for (const [index, parameter] of parameters.entries()) {
    const declaration = parameter.valueDeclaration;
    if (declaration === undefined || (ts.isParameter(declaration) && declaration.dotDotDotToken)) {
      continue;
    }
    const type = checker.getTypeOfSymbolAtLocation(parameter, declaration);
    const argument = call.arguments[index];
    if (isSignalType(type) && argument === undefined) {
      return parameter.getName();
    }
    if (hasSignalProperty(checker, type) && !suppliesSignal(argument)) {
      return `${parameter.getName()}.signal`;
    }
  }
  return undefined;
}
