import { ancestorsOf } from '../analysis/ancestry.mjs';
import {
  isFunctionNode,
  resolveConstant,
  resolveFunction,
} from '../analysis/constant-resolution.mjs';
import { configState } from '../security/http/http-config.mjs';
import { memberName, unwrapped } from '../security/security-values.mjs';
import { settlementChain } from './race-operations.mjs';
import { globalMemberCall, nodesIn } from './syntax-nodes.mjs';

const SIGNAL_KEYS = ['signal', 'abortSignal', 'cancelToken'];
const SIGNAL_NAME = /^(?:signal|controller|abortController|cancelToken|[a-z]\w*Signal)$/u;
const OPTIONS_NAME = /^(?:options?|opts?|init|settings)$/u;
const SIGNAL_FACTORIES = ['timeout', 'any', 'abort'];
const CLEANUP_METHODS = new Set(['abort', 'cancel', 'destroy', 'kill', 'terminate', 'dispose']);
const HANDLE_TYPES = new Set(['Identifier', 'MemberExpression', 'ThisExpression']);

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

function typedAsSignal(param, sourceCode) {
  return param.typeAnnotation !== undefined && sourceCode.getText(param).includes('AbortSignal');
}

export function signalParameterOf(context, callee) {
  const fn = resolveFunction(context, unwrapped(callee));
  if (fn === undefined) {
    return undefined;
  }
  const named = parameterIdentifiers(fn).find(
    (identifier) =>
      identifier?.type === 'Identifier' &&
      (SIGNAL_NAME.test(identifier.name) || typedAsSignal(identifier, context.sourceCode)),
  );
  return named?.name;
}

export function closesOverSignal(context, callee) {
  const fn = resolveFunction(context, unwrapped(callee));
  if (fn === undefined) {
    return false;
  }
  const own = new Set(parameterIdentifiers(fn).map((identifier) => identifier?.name));
  return nodesIn(fn.body).some(
    (node) => node.type === 'Identifier' && SIGNAL_NAME.test(node.name) && !own.has(node.name),
  );
}

function textOf(context, node) {
  return context.sourceCode.getText(unwrapped(node));
}

function operationHandles(context, call) {
  const callee = unwrapped(call.callee);
  const receiver = callee.type === 'MemberExpression' ? [callee.object] : [];
  const handles = [...receiver, ...call.arguments].filter((node) =>
    HANDLE_TYPES.has(unwrapped(node).type),
  );
  return new Set(handles.map((node) => textOf(context, node)));
}

function within(node, root) {
  return root !== undefined && root !== null && (node === root || ancestorsOf(node).includes(root));
}

function inTimeoutPath(cleanup, race) {
  const trying = ancestorsOf(race.node).filter(
    (ancestor) => ancestor.type === 'TryStatement' && within(race.node, ancestor.block),
  );
  return (
    race.timeouts.some((entry) => within(cleanup, entry)) ||
    trying.some((owner) => within(cleanup, owner.handler) || within(cleanup, owner.finalizer)) ||
    settlementChain(race.node).some((link) => link.arguments.some((arg) => within(cleanup, arg)))
  );
}

export function cleansUp(context, call, race) {
  const owner = ancestorsOf(race.node).find((ancestor) => isFunctionNode(ancestor));
  const handles = operationHandles(context, call);
  return nodesIn(owner?.body ?? context.sourceCode.ast).some((inner) => {
    const callee = inner.type === 'CallExpression' ? unwrapped(inner.callee) : undefined;
    return (
      callee?.type === 'MemberExpression' &&
      CLEANUP_METHODS.has(memberName(callee)) &&
      (handles.has(textOf(context, callee.object)) || inTimeoutPath(inner, race))
    );
  });
}
