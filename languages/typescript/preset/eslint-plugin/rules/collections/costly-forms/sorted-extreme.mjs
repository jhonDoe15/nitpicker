import { variableNamed } from '../../analysis/ancestry.mjs';
import {
  calledMember,
  memberName,
  methodCallOn,
  numberValue,
  outerOf,
  unwrapped,
} from './repeated-runs.mjs';

const SORTS = new Set(['sort', 'toSorted']);
const ENDS = new Set(['pop', 'shift']);
const FIRST = 0;
const LAST = -1;

function isIndexZero(property) {
  const value = unwrapped(property);
  return numberValue(value) === FIRST || (value.type === 'Literal' && value.value === '0');
}

function isFirstElementRead(member) {
  const outer = outerOf(member);
  const { parent } = outer;
  const written =
    (parent.type === 'AssignmentExpression' && parent.left === outer) ||
    (parent.type === 'UpdateExpression' && parent.argument === outer) ||
    (parent.type === 'UnaryExpression' && parent.operator === 'delete');
  return member.computed && !written && isIndexZero(member.property);
}

function takesEnd(call) {
  const outer = outerOf(call);
  const { parent } = outer;
  if (parent.type === 'VariableDeclarator' && parent.init === outer) {
    const { id } = parent;
    return (
      id.type === 'ArrayPattern' &&
      id.elements.length === 1 &&
      id.elements[0]?.type !== 'RestElement'
    );
  }
  const method = methodCallOn(call);
  if (method?.member !== undefined) {
    return isFirstElementRead(method.member);
  }
  if (method?.call === undefined) {
    return false;
  }
  const { arguments: args } = method.call;
  if (ENDS.has(method.name)) {
    return args.length === 0;
  }
  return method.name === 'at' && args.length === 1 && [FIRST, LAST].includes(numberValue(args[0]));
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
