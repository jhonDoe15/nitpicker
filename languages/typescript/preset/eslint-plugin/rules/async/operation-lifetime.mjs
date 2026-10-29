import { ancestorsOf } from '../analysis/ancestry.mjs';
import {
  isFunctionNode,
  resolveConstant,
  resolveFunction,
} from '../analysis/constant-resolution.mjs';
import { configState } from '../security/http/http-config.mjs';
import { memberName, unwrapped } from '../security/security-values.mjs';
import { globalMemberCall, nodesIn } from './syntax-nodes.mjs';

const SIGNAL_KEYS = ['signal', 'abortSignal', 'cancelToken', 'timeout'];
const SIGNAL_NAME = /(?:signal|abort|cancel)|^controller$/iu;
const OPTIONS_NAME = /^(?:options?|opts?|init|config|settings|context|ctx|request|req|params)$/iu;
const SIGNAL_FACTORIES = ['timeout', 'any', 'abort'];
const CLEANUP_METHODS = new Set(['abort', 'cancel', 'destroy', 'kill', 'terminate', 'dispose']);

function ownsLifetime(context, argument) {
  const target = unwrapped(resolveConstant(context, unwrapped(argument)));
  switch (target?.type) {
    case undefined:
      return false;
    case 'SpreadElement':
      return true;
    case 'ObjectExpression':
      return configState(context, argument, SIGNAL_KEYS) !== 'missing';
    case 'Identifier':
      return SIGNAL_NAME.test(target.name) || OPTIONS_NAME.test(target.name);
    case 'MemberExpression':
      return SIGNAL_NAME.test(memberName(target) ?? '');
    case 'CallExpression':
      return SIGNAL_FACTORIES.some((name) =>
        globalMemberCall(context, target, `AbortSignal.${name}`),
      );
    default:
      return false;
  }
}

export function passesLifetimeOwner(context, call) {
  return call.arguments.some((argument) => ownsLifetime(context, argument));
}

function parameterIdentifiers(fn) {
  return fn.params.flatMap((param) => {
    const inner = param.type === 'AssignmentPattern' ? param.left : param;
    if (inner.type === 'ObjectPattern') {
      return inner.properties.map((property) => property.key ?? property.argument);
    }
    return [inner];
  });
}

function typedAsSignal(fn, sourceCode) {
  return fn.params.some((param) => sourceCode.getText(param).includes('AbortSignal'));
}

export function signalParameterOf(context, callee) {
  const fn = resolveFunction(context, unwrapped(callee));
  if (fn === undefined) {
    return undefined;
  }
  const named = parameterIdentifiers(fn).find(
    (identifier) => identifier?.type === 'Identifier' && SIGNAL_NAME.test(identifier.name),
  );
  if (named !== undefined) {
    return named.name;
  }
  return typedAsSignal(fn, context.sourceCode) ? 'signal' : undefined;
}

export function closesOverSignal(context, callee) {
  const fn = resolveFunction(context, unwrapped(callee));
  if (fn === undefined) {
    return false;
  }
  const own = new Set(parameterIdentifiers(fn).map((identifier) => identifier?.name));
  return nodesIn(fn.body, context.sourceCode.visitorKeys).some(
    (node) => node.type === 'Identifier' && SIGNAL_NAME.test(node.name) && !own.has(node.name),
  );
}

export function cleansUpInFunction(context, node) {
  const owner = ancestorsOf(node).find((ancestor) => isFunctionNode(ancestor));
  return nodesIn(owner?.body, context.sourceCode.visitorKeys).some((inner) => {
    const callee = inner.type === 'CallExpression' ? unwrapped(inner.callee) : undefined;
    return callee?.type === 'MemberExpression' && CLEANUP_METHODS.has(memberName(callee));
  });
}
