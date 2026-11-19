import {
  AST_NODE_TYPES,
  type ParserServicesWithTypeInformation,
  type TSESLint,
  type TSESTree,
} from '@typescript-eslint/utils';
import type TypeScript from 'typescript';
import { contains, type SourceCode } from '../../typed/node-views.mts';
import { ts } from '../../typed/typescript-views.mts';
import { partsOf } from '../../analysis/narrowing/type-parts.mts';
import { memberName } from '../../analysis/test-code-analysis.mts';
import { isFunctionExpression, shortText, type ExecutorSource } from './executor-sources.mts';

type Context = { readonly sourceCode: SourceCode };
type Services = ParserServicesWithTypeInformation | undefined;
type FunctionNode = TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression;
type MessageId = 'missingErrorParameter' | 'ignoredError' | 'resolvesWithError';
type Finding = {
  readonly node: TSESTree.Node;
  readonly messageId: MessageId;
  readonly data: Readonly<Record<string, string>>;
};
type FindingScope = {
  readonly context: Context;
  readonly services: Services;
  readonly callee: string;
};

const ERROR_NAME = /^_*(?:e|err|error|ex|exc|exception)$|[a-z](?:Err|Error)$/u;
const PROMISE_METHODS = new Set<string>(['then', 'catch', 'finally']);
const NO_VALUE = ts.TypeFlags.Null | ts.TypeFlags.Undefined | ts.TypeFlags.Void;
const UNKNOWN = ts.TypeFlags.Any | ts.TypeFlags.Unknown;

function isErrorType(checker: TypeScript.TypeChecker, type: TypeScript.Type): boolean {
  return partsOf(type)
    .filter((part) => (part.flags & (NO_VALUE | UNKNOWN)) === 0)
    .some((part) => {
      const apparent = checker.getApparentType(part);
      return (
        apparent.getProperty('message') !== undefined && apparent.getProperty('name') !== undefined
      );
    });
}

function contextualErrorFirst(
  services: ParserServicesWithTypeInformation,
  node: TSESTree.Expression,
): boolean {
  const checker = services.program.getTypeChecker();
  const contextual = services.getContextualType(node);
  if (contextual === undefined) {
    return false;
  }
  return partsOf(contextual)
    .flatMap((part) => part.getCallSignatures())
    .some((signature) => {
      const first = signature.getParameters()[0];
      return (
        first !== undefined && isErrorType(checker, services.getTypeOfSymbolAtLocation(first, node))
      );
    });
}

function isErrorParameter(services: Services, parameter: TSESTree.Identifier): boolean {
  if (ERROR_NAME.test(parameter.name)) {
    return true;
  }
  if (services === undefined) {
    return false;
  }
  const checker = services.program.getTypeChecker();
  const target = services.esTreeNodeToTSNodeMap.get(parameter);
  return isErrorType(checker, checker.getTypeAtLocation(target));
}

function settlesInside(fn: FunctionNode, variable: TSESLint.Scope.Variable): boolean {
  return variable.references.some((reference) => contains(fn, reference.identifier));
}

function isUnread(context: Context, fn: FunctionNode, parameter: TSESTree.Identifier): boolean {
  const variable = context.sourceCode
    .getDeclaredVariables(fn)
    .find((candidate) => candidate.name === parameter.name);
  return variable !== undefined && variable.references.length === 0;
}

export function readsError(context: Context, services: Services, fn: FunctionNode): boolean {
  const [parameter] = fn.params;
  return (
    parameter?.type === AST_NODE_TYPES.Identifier &&
    isErrorParameter(services, parameter) &&
    !isUnread(context, fn, parameter)
  );
}

function callbackFinding(
  { context, services, callee }: FindingScope,
  fn: FunctionNode,
): Finding | undefined {
  const [parameter] = fn.params;
  if (parameter === undefined) {
    return services !== undefined && contextualErrorFirst(services, fn)
      ? { node: fn, messageId: 'missingErrorParameter', data: { callee } }
      : undefined;
  }
  return parameter.type === AST_NODE_TYPES.Identifier &&
    isErrorParameter(services, parameter) &&
    isUnread(context, fn, parameter)
    ? { node: parameter, messageId: 'ignoredError', data: { name: parameter.name, callee } }
    : undefined;
}

function argumentFinding(
  {
    context,
    services,
    resolve,
    callee,
  }: FindingScope & { readonly resolve: TSESLint.Scope.Variable },
  argument: TSESTree.CallExpressionArgument,
): Finding | undefined {
  if (isFunctionExpression(argument)) {
    return settlesInside(argument, resolve)
      ? callbackFinding({ context, services, callee }, argument)
      : undefined;
  }
  return argument.type === AST_NODE_TYPES.Identifier &&
    argument.name === resolve.name &&
    services !== undefined &&
    contextualErrorFirst(services, argument)
    ? { node: argument, messageId: 'resolvesWithError', data: { name: argument.name, callee } }
    : undefined;
}

export function ignoredErrors(
  context: Context,
  {
    sources,
    resolve,
    services,
  }: {
    readonly sources: readonly ExecutorSource[];
    readonly resolve: TSESLint.Scope.Variable;
    readonly services: Services;
  },
): Finding[] {
  return sources
    .filter(
      ({ kind, call }) =>
        kind === 'callback' && !PROMISE_METHODS.has(memberName(call.callee) ?? ''),
    )
    .flatMap(({ call }) => {
      const callee = shortText(context, call.callee);
      return call.arguments.map((argument) =>
        argumentFinding({ context, services, resolve, callee }, argument),
      );
    })
    .filter((finding) => finding !== undefined);
}
