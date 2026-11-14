import { ts } from '../../../../../typescript-api/typescript-api.mjs';
import { partsOf } from '../../analysis/narrowing/type-parts.mjs';
import { memberName } from '../../analysis/test-code-analysis.mjs';
import { isFunctionExpression, shortText } from './executor-sources.mjs';

const ERROR_NAME = /^_*(?:e|err|error|ex|exc|exception)$|[a-z](?:Err|Error)$/u;
const PROMISE_METHODS = new Set(['then', 'catch', 'finally']);
const NO_VALUE = ts.TypeFlags.Null | ts.TypeFlags.Undefined | ts.TypeFlags.Void;
const UNKNOWN = ts.TypeFlags.Any | ts.TypeFlags.Unknown;

function isErrorType(checker, type) {
  return partsOf(type)
    .filter((part) => (part.flags & (NO_VALUE | UNKNOWN)) === 0)
    .some((part) => {
      const apparent = checker.getApparentType(part);
      return (
        apparent.getProperty('message') !== undefined && apparent.getProperty('name') !== undefined
      );
    });
}

function contextualErrorFirst(services, node) {
  const checker = services.program.getTypeChecker();
  const target = services.esTreeNodeToTSNodeMap.get(node);
  const contextual = checker.getContextualType(target);
  if (contextual === undefined) {
    return false;
  }
  return partsOf(contextual)
    .flatMap((part) => part.getCallSignatures())
    .some((signature) => {
      const first = signature.getParameters()[0];
      return (
        first !== undefined &&
        isErrorType(checker, checker.getTypeOfSymbolAtLocation(first, target))
      );
    });
}

function isErrorParameter(services, parameter) {
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

function within(node, outer) {
  return node.range[0] >= outer.range[0] && node.range[1] <= outer.range[1];
}

function settlesInside(fn, variable) {
  return variable.references.some((reference) => within(reference.identifier, fn));
}

function isUnread(context, fn, parameter) {
  const variable = context.sourceCode
    .getDeclaredVariables(fn)
    .find((candidate) => candidate.name === parameter.name);
  return variable !== undefined && variable.references.length === 0;
}

export function readsError(context, services, fn) {
  const [parameter] = fn.params;
  return (
    parameter?.type === 'Identifier' &&
    isErrorParameter(services, parameter) &&
    !isUnread(context, fn, parameter)
  );
}

function callbackFinding({ context, services, callee }, fn) {
  const [parameter] = fn.params;
  if (parameter === undefined) {
    return services !== undefined && contextualErrorFirst(services, fn)
      ? { node: fn, messageId: 'missingErrorParameter', data: { callee } }
      : undefined;
  }
  return parameter.type === 'Identifier' &&
    isErrorParameter(services, parameter) &&
    isUnread(context, fn, parameter)
    ? { node: parameter, messageId: 'ignoredError', data: { name: parameter.name, callee } }
    : undefined;
}

function argumentFinding({ context, services, resolve, callee }, argument) {
  if (isFunctionExpression(argument)) {
    return settlesInside(argument, resolve)
      ? callbackFinding({ context, services, callee }, argument)
      : undefined;
  }
  return argument.type === 'Identifier' &&
    argument.name === resolve.name &&
    services !== undefined &&
    contextualErrorFirst(services, argument)
    ? { node: argument, messageId: 'resolvesWithError', data: { name: argument.name, callee } }
    : undefined;
}

export function ignoredErrors(context, { sources, resolve, services }) {
  return sources
    .filter(
      ({ kind, call }) => kind === 'callback' && !PROMISE_METHODS.has(memberName(call.callee)),
    )
    .flatMap(({ call }) => {
      const callee = shortText(context, call.callee);
      return call.arguments.map((argument) =>
        argumentFinding({ context, services, resolve, callee }, argument),
      );
    })
    .filter((finding) => finding !== undefined);
}
