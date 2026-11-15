import {
  AST_NODE_TYPES,
  type ParserServicesWithTypeInformation,
  type TSESLint,
  type TSESTree,
} from '@typescript-eslint/utils';
import type TypeScript from 'typescript';
import { ts } from '../../rules/typed/typescript-views.mts';
import { NULLISH_WRAPPERS, unwrapOf } from '../../rules/typed/syntax-views.mts';

type Docs = { readonly requiresTypeChecking: boolean };
type InlineFunction = TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression;
const MESSAGE =
  'This call returns a function that is dropped, so it never runs and the check inside it never happens. Call it (`check(ctx)()`), pass it on (`run(check(ctx))`) or assign it. An exception fits only a function that returns a callback on purpose.';

const REGISTRATIONS =
  /^(subscribe|on|once|addListener|addEventListener|listen|watch|observe|on[A-Z].*)$/;

function calleeName(callee: TSESTree.Node): string {
  if (callee.type === AST_NODE_TYPES.Identifier) {
    return callee.name;
  }
  return callee.type === AST_NODE_TYPES.MemberExpression &&
    callee.property.type === AST_NODE_TYPES.Identifier
    ? callee.property.name
    : '';
}

function isFunctionNode(node: TSESTree.Node): node is InlineFunction {
  return (
    node.type === AST_NODE_TYPES.ArrowFunctionExpression ||
    node.type === AST_NODE_TYPES.FunctionExpression
  );
}

function takesFunctionReturningVoid(
  checker: TypeScript.TypeChecker,
  services: ParserServicesWithTypeInformation,
  call: TSESTree.CallExpression,
): boolean {
  return call.arguments.some((argument) => {
    if (!isFunctionNode(argument)) {
      return false;
    }
    const type = checker.getTypeAtLocation(services.esTreeNodeToTSNodeMap.get(argument));
    return type.getCallSignatures().some((signature) => {
      const returned = signature.getReturnType();
      return returned
        .getCallSignatures()
        .some(
          (inner) =>
            inner.getParameters().length === 0 &&
            (inner.getReturnType().flags & ts.TypeFlags.Void) !== 0,
        );
    });
  });
}

function unwrapped(node: TSESTree.Node): TSESTree.Node {
  return unwrapOf(node, NULLISH_WRAPPERS);
}

function isPlainFunction(type: TypeScript.Type): boolean {
  return type.getCallSignatures().length > 0 && type.getProperties().length === 0;
}

function returnsVoid(contextual: TypeScript.Type | undefined): boolean {
  return (
    contextual !== undefined &&
    contextual
      .getCallSignatures()
      .some((signature) => (signature.getReturnType().flags & ts.TypeFlags.Void) !== 0)
  );
}

function returnsFunction(
  {
    checker,
    services,
  }: { checker: TypeScript.TypeChecker; services: ParserServicesWithTypeInformation },
  call: TSESTree.CallExpression,
): boolean {
  if (
    REGISTRATIONS.test(calleeName(call.callee)) ||
    takesFunctionReturningVoid(checker, services, call)
  ) {
    return false;
  }
  const tsNode = services.esTreeNodeToTSNodeMap.get(call);
  return isPlainFunction(checker.getTypeAtLocation(tsNode));
}

function hasTypeInformation(
  services: TSESLint.SourceCode['parserServices'],
): services is ParserServicesWithTypeInformation {
  return (
    services?.program !== null &&
    services?.program !== undefined &&
    services.esTreeNodeToTSNodeMap !== undefined
  );
}

export const rule: TSESLint.RuleModule<'dropped', [], Docs> = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow dropping the function a call returns in a test',
      requiresTypeChecking: true,
    },
    schema: [],
    messages: { dropped: MESSAGE },
  },
  create(context) {
    const services = context.sourceCode.parserServices;
    if (!hasTypeInformation(services)) {
      return {};
    }
    const checker = services.program.getTypeChecker();

    return {
      ExpressionStatement(node) {
        const call = unwrapped(node.expression);
        if (
          call.type === AST_NODE_TYPES.CallExpression &&
          returnsFunction({ checker, services }, call)
        ) {
          context.report({ node: call, messageId: 'dropped' });
        }
      },
      'ArrowFunctionExpression[expression=true]'(node: TSESTree.ArrowFunctionExpression) {
        const call = unwrapped(node.body);
        const contextual = checker.getContextualType(services.esTreeNodeToTSNodeMap.get(node));
        if (
          call.type === AST_NODE_TYPES.CallExpression &&
          returnsVoid(contextual) &&
          returnsFunction({ checker, services }, call)
        ) {
          context.report({ node: call, messageId: 'dropped' });
        }
      },
    };
  },
};
