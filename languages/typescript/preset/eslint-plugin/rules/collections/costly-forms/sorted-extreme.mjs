import { variableNamed } from '../../analysis/ancestry.mjs';
import { calledMember, memberName, methodCallOn, outerOf, unwrapped } from './repeated-runs.mjs';

const SORTS = new Set(['sort', 'toSorted']);
const ENDS = new Set(['pop', 'shift']);
const FIRST = 0;
const LAST = -1;

function numberValue(node) {
  const value = unwrapped(node);
  if (value.type === 'UnaryExpression' && value.operator === '-') {
    const inner = numberValue(value.argument);
    return inner === undefined ? undefined : -inner;
  }
  return value.type === 'Literal' && typeof value.value === 'number' ? value.value : undefined;
}

function takesEnd(call) {
  const outer = outerOf(call);
  const { parent } = outer;
  if (parent.type === 'VariableDeclarator' && parent.init === outer) {
    const { id } = parent;
    return id.type === 'ArrayPattern' && id.elements.length === 1 && id.elements[0]?.type !== 'RestElement';
  }
  const method = methodCallOn(call);
  if (method?.member !== undefined) {
    return method.member.computed && numberValue(method.member.property) === FIRST;
  }
  if (method?.call === undefined) {
    return false;
  }
  const { arguments: args } = method.call;
  if (ENDS.has(method.name)) {
    return args.length === 0;
  }
  return (
    method.name === 'at' && args.length === 1 && [FIRST, LAST].includes(numberValue(args[0]))
  );
}

function isLaterRead(sourceCode, identifier, call) {
  const variable = variableNamed(sourceCode, identifier);
  return (
    variable === undefined ||
    variable.references.some((reference) => reference.identifier.range[0] > call.range[1])
  );
}

function sortsSharedArray(sourceCode, member, call) {
  if (memberName(member) !== 'sort') {
    return false;
  }
  const receiver = unwrapped(member.object);
  if (receiver.type === 'Identifier') {
    return isLaterRead(sourceCode, receiver, call);
  }
  return receiver.type === 'MemberExpression' || receiver.type === 'ThisExpression';
}

export function sortedExtreme(sourceCode, call) {
  const member = calledMember(call);
  if (member === undefined || !SORTS.has(memberName(member)) || !takesEnd(call)) {
    return undefined;
  }
  if (sortsSharedArray(sourceCode, member, call)) {
    return undefined;
  }
  return { node: call, messageId: 'sortForExtreme', data: { method: memberName(member) } };
}
