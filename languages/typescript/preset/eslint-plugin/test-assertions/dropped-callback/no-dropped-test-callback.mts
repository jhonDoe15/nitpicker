import {
  AST_NODE_TYPES,
  type ParserServicesWithTypeInformation,
  type TSESLint,
  type TSESTree,
} from '@typescript-eslint/utils';
import path from 'node:path';
import type TypeScript from 'typescript';
import { ts } from '../../rules/typed/typescript-views.mts';
import { readLayout } from '../../rules/typed/policy-views.mts';
import { hasTypeInformation } from '../../rules/time/time-views.mts';
import { unwrapped } from '../../rules/typed/syntax-views.mts';

type Docs = { readonly requiresTypeChecking: boolean };
type InlineFunction = TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression;
const MESSAGE =
  'This call returns a function that is dropped, so it never runs and the check inside it never happens. Call it (`check(ctx)()`), pass it on (`run(check(ctx))`) or assign it. An exception fits only a function that returns a callback on purpose.';

const REGISTRATIONS =
  /^(sub|subscribe|on|once|add|addListener|addEventListener|listen|watch|observe|register|on[A-Z].*)$/;
const CLEANUP_TYPES = /^(Unsubscribe|Unsubscriber|Dispose|Disposer|Cleanup|Teardown)$/;
const TEST_HELPER_PATH =
  /(?:^|\/)(?:test-support|testing|__tests__|tests?|specs?|fixtures|test-?utils)(?:\/|$)|\.(?:test|spec)\.[^/]+$/iu;
const layout = readLayout();

export function calleeName(callee: TSESTree.Node): string {
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

type Views = {
  readonly checker: TypeScript.TypeChecker;
  readonly services: ParserServicesWithTypeInformation;
};

function isVoidThunk(type: TypeScript.Type): boolean {
  const [signature] = type.getCallSignatures();
  return (
    signature !== undefined &&
    signature.getParameters().length === 0 &&
    (signature.getReturnType().flags & ts.TypeFlags.Void) !== 0
  );
}

function takesCallback({ checker, services }: Views, call: TSESTree.CallExpression): boolean {
  return call.arguments.some(
    (argument) =>
      checker.getTypeAtLocation(services.esTreeNodeToTSNodeMap.get(argument)).getCallSignatures()
        .length > 0,
  );
}

function declaredOutsideTests(
  { checker, services }: Views,
  call: TSESTree.CallExpression,
): boolean {
  const declaration = checker.getResolvedSignature(
    services.esTreeNodeToTSNodeMap.get(call),
  )?.declaration;
  if (declaration === undefined) {
    return false;
  }
  const config = services.program.getCompilerOptions()['configFilePath'];
  const root =
    typeof config === 'string' ? path.dirname(config) : services.program.getCurrentDirectory();
  const relative = path.relative(root, declaration.getSourceFile().fileName).replaceAll('\\', '/');
  return (
    relative.startsWith('..') ||
    !(
      TEST_HELPER_PATH.test(relative) ||
      layout.isTestFile(relative) ||
      layout.isTestPath(relative) ||
      layout.isFixturePath(relative)
    )
  );
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

function returnsFunction(views: Views, call: TSESTree.CallExpression): boolean {
  const { checker, services } = views;
  if (
    REGISTRATIONS.test(calleeName(call.callee)) ||
    takesFunctionReturningVoid(checker, services, call)
  ) {
    return false;
  }
  const returned = checker.getTypeAtLocation(services.esTreeNodeToTSNodeMap.get(call));
  return (
    isPlainFunction(returned) &&
    !CLEANUP_TYPES.test(returned.aliasSymbol?.name ?? '') &&
    !(isVoidThunk(returned) && takesCallback(views, call)) &&
    !declaredOutsideTests(views, call)
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
