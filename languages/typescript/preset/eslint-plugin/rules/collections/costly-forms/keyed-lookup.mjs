import { ancestorsOf, variableNamed } from '../../analysis/ancestry.mjs';
import {
  contains,
  equalitySides,
  memberName,
  methodCallOn,
  outerOf,
  referencesName,
  someNode,
  repeatedRole,
  returnedExpression,
  singleParameter,
  unwrapped,
} from './repeated-runs.mjs';

const LOOKUPS = new Set(['find', 'findIndex', 'findLast', 'findLastIndex', 'some']);
const MUTATORS = new Set([
  'copyWithin',
  'fill',
  'pop',
  'push',
  'reverse',
  'shift',
  'sort',
  'splice',
  'unshift',
]);
const CLASS_TYPES = new Set(['ClassBody']);

function keyPath(node, parameter) {
  const value = unwrapped(node);
  if (value.type !== 'MemberExpression') {
    return undefined;
  }
  const key = memberName(value);
  const object = unwrapped(value.object);
  if (key === undefined) {
    return undefined;
  }
  if (object.type === 'Identifier') {
    return object.name === parameter ? key : undefined;
  }
  const inner = keyPath(object, parameter);
  return inner === undefined ? undefined : `${inner}.${key}`;
}

function isConstantValue(node) {
  const value = unwrapped(node);
  return (
    value.type === 'Literal' ||
    (value.type === 'TemplateLiteral' && value.expressions.length === 0)
  );
}

function lookupKey(callback) {
  const parameter = singleParameter(callback);
  const sides = parameter === undefined ? undefined : equalitySides(returnedExpression(callback));
  if (sides === undefined) {
    return undefined;
  }
  const [left, right] = sides;
  const keyed = [
    [keyPath(left, parameter), right],
    [keyPath(right, parameter), left],
  ].find(([key, other]) => key !== undefined && !referencesName(other, parameter));
  return keyed === undefined || isConstantValue(keyed[1]) ? undefined : keyed[0];
}

function isAssignmentTarget(node) {
  const outer = outerOf(node);
  const { parent } = outer;
  return (
    (parent.type === 'AssignmentExpression' && parent.left === outer) ||
    (parent.type === 'UpdateExpression' && parent.argument === outer)
  );
}

function isMutation(node) {
  const method = methodCallOn(node);
  if (method === undefined) {
    return false;
  }
  if (method.call !== undefined) {
    return MUTATORS.has(method.name);
  }
  return isAssignmentTarget(method.member);
}

function variableReceiver(sourceCode, identifier) {
  const variable = variableNamed(sourceCode, identifier);
  const definition = variable?.defs[0];
  if (definition === undefined || !['Variable', 'Parameter'].includes(definition.type)) {
    return undefined;
  }
  const references = variable.references.filter((reference) => !reference.init);
  const changed = references.some(
    (reference) => reference.isWrite() || isMutation(reference.identifier),
  );
  if (changed) {
    return undefined;
  }
  return definition.type === 'Variable' ? definition.parent : definition.node;
}

function thisField(member) {
  const object = unwrapped(member.object);
  return object.type === 'ThisExpression' ? memberName(member) : undefined;
}

function isConstructorCode(node, classBody) {
  const method = classBody.body.find((element) => contains(element, node));
  return method?.type === 'MethodDefinition' && method.kind === 'constructor';
}

function changesField(node, field, classBody) {
  if (node.type !== 'MemberExpression' || thisField(node) !== field) {
    return false;
  }
  if (isAssignmentTarget(node)) {
    return !isConstructorCode(node, classBody);
  }
  return isMutation(node);
}

function fieldReceiver(member) {
  const field = thisField(member);
  const classBody = ancestorsOf(member).find((node) => CLASS_TYPES.has(node.type));
  if (field === undefined || classBody === undefined) {
    return undefined;
  }
  return someNode(classBody, (node) => changesField(node, field, classBody))
    ? undefined
    : classBody;
}

function receiverBoundary(sourceCode, receiver) {
  if (receiver.type === 'Identifier') {
    return variableReceiver(sourceCode, receiver);
  }
  return receiver.type === 'MemberExpression' ? fieldReceiver(receiver) : undefined;
}

export function keyedLookup(sourceCode, call) {
  const callee = unwrapped(call.callee);
  const method = callee.type === 'MemberExpression' ? memberName(callee) : undefined;
  if (!LOOKUPS.has(method) || call.arguments.length !== 1) {
    return undefined;
  }
  const key = lookupKey(call.arguments[0]);
  const receiver = unwrapped(callee.object);
  const boundary = key === undefined ? undefined : receiverBoundary(sourceCode, receiver);
  if (boundary === undefined || repeatedRole(call, boundary) === undefined) {
    return undefined;
  }
  return {
    node: call,
    messageId: 'lookupInLoop',
    data: { name: sourceCode.getText(receiver), method, key },
  };
}
