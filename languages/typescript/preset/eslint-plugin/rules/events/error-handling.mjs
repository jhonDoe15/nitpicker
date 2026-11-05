import { chainOf } from '../analysis/ancestry.mjs';
import { findVariable } from '../analysis/constant-resolution.mjs';
import {
  isTypeWrapper,
  memberName,
  staticKey,
  typeServices,
} from '../security/security-values.mjs';
import { calledName, importedName, listensForErrors } from './emitter-creations.mjs';
import {
  HANDLING_CALLS,
  HANDLING_STATICS,
  INPUT_READERS,
  isChainableMethod,
  isConsumingMethod,
} from './emitter-modules.mjs';
import { helperOutcome } from './helpers/helper-bodies.mjs';

const ESCAPES = new Map([
  ['ReturnStatement', 'argument'],
  ['YieldExpression', 'argument'],
  ['ArrowFunctionExpression', 'body'],
  ['AssignmentExpression', 'right'],
  ['VariableDeclarator', 'init'],
  ['ExportDefaultDeclaration', 'declaration'],
  ['ExportSpecifier', 'local'],
  ['SpreadElement', 'argument'],
]);
const CALLS = new Set(['CallExpression', 'NewExpression']);

function outerOf(node) {
  return chainOf(node, (current) =>
    isTypeWrapper(current.parent) && current.parent.expression === current
      ? current.parent
      : undefined,
  ).at(-1);
}

function methodCall(member) {
  const call = member?.parent;
  return call?.type === 'CallExpression' && call.callee === member ? call : undefined;
}

function nextChainedCall(call) {
  if (!isChainableMethod(memberName(call.callee))) {
    return undefined;
  }
  const outer = outerOf(call);
  const next = outer.parent;
  return next?.type === 'MemberExpression' && next.object === outer ? methodCall(next) : undefined;
}

function receiverOutcome(context, member) {
  const calls = chainOf(methodCall(member), nextChainedCall);
  const handled =
    calls.some((call) => listensForErrors(context, call)) ||
    (calls.length > 0 && isConsumingMethod(memberName(member)));
  return handled ? 'handled' : 'neutral';
}

function fitsPosition(entry, call, argument) {
  return !entry.first || call.arguments[0] === argument;
}

function isStaticHandler(scope, call, argument) {
  const { callee } = call;
  return (
    callee.type === 'MemberExpression' &&
    HANDLING_STATICS.some(
      (entry) =>
        fitsPosition(entry, call, argument) &&
        entry.names.has(memberName(callee)) &&
        importedName(scope.context, callee.object, scope.bindingsFor(entry.modules)) ===
          entry.owner,
    )
  );
}

function isCallTo(scope, call, entries) {
  return entries.find((entry) =>
    entry.names.has(calledName(scope.context, call, scope.bindingsFor(entry.modules))),
  );
}

function isHandlingCall(scope, call, argument) {
  const direct = isCallTo(scope, call, HANDLING_CALLS);
  return (
    (direct !== undefined && fitsPosition(direct, call, argument)) ||
    isStaticHandler(scope, call, argument)
  );
}

const PROJECT_DEFINITIONS = new Set(['FunctionName', 'ClassName']);

function isProjectCallee(context, callee) {
  if (callee.type === 'MemberExpression') {
    return callee.object.type === 'ThisExpression';
  }
  if (callee.type !== 'Identifier') {
    return false;
  }
  const definition = findVariable(context, callee, callee.name)?.defs.at(0);
  const source = definition?.parent?.source?.value;
  return (
    PROJECT_DEFINITIONS.has(definition?.type) ||
    (definition?.type === 'ImportBinding' && typeof source === 'string' && source.startsWith('.'))
  );
}

function argumentOutcome(scope, call, argument) {
  if (isHandlingCall(scope, call, argument)) {
    return 'handled';
  }
  const index = call.arguments.indexOf(argument);
  const services = typeServices(scope.context);
  if (index === -1) {
    return 'neutral';
  }
  if (services === undefined) {
    return isProjectCallee(scope.context, call.callee) ? 'escaped' : 'neutral';
  }
  return helperOutcome(services, call, index);
}

const CONTAINERS = new Set(['ObjectExpression', 'ArrayExpression', 'Property', 'SpreadElement']);

function containerRoot(node) {
  return chainOf(node, (current) =>
    CONTAINERS.has(current.parent?.type) ? current.parent : undefined,
  ).at(-1);
}

function isReaderInput(scope, property) {
  const object = property.parent;
  const call = object.parent;
  return (
    staticKey(property) === 'input' &&
    CALLS.has(call?.type) &&
    call.arguments[0] === object &&
    isCallTo(scope, call, INPUT_READERS) !== undefined
  );
}

function containedOutcome(scope, node) {
  if (node.parent.type === 'Property' && isReaderInput(scope, node.parent)) {
    return 'handled';
  }
  const root = containerRoot(node);
  return escapeOutcome(root.parent, root);
}

function escapeOutcome(parent, node) {
  return ESCAPES.has(parent.type) && parent[ESCAPES.get(parent.type)] === node
    ? 'escaped'
    : 'neutral';
}

function referenceOutcome(scope, reference) {
  const node = outerOf(reference);
  const { parent } = node;
  if (parent.type === 'MemberExpression' && parent.object === node) {
    return receiverOutcome(scope.context, parent);
  }
  if (parent.type === 'ForOfStatement' && parent.await && parent.right === node) {
    return 'handled';
  }
  if (CALLS.has(parent.type) && parent.callee !== node) {
    return argumentOutcome(scope, parent, node);
  }
  if ((parent.type === 'Property' && parent.value === node) || parent.type === 'ArrayExpression') {
    return containedOutcome(scope, node);
  }
  return escapeOutcome(parent, node);
}

export function referencesOutcome(scope, references) {
  const outcomes = new Set(references.map((reference) => referenceOutcome(scope, reference)));
  if (outcomes.has('handled')) {
    return 'handled';
  }
  return outcomes.has('escaped') ? 'escaped' : 'unhandled';
}
