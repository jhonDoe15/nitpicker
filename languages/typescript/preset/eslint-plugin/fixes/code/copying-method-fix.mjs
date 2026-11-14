import { chainOf } from '../../rules/analysis/ancestry.mjs';
import { replacing } from '../support/ranges.mjs';

const COPYING_FORMS = new Map([
  ['sort', 'toSorted'],
  ['reverse', 'toReversed'],
]);
const FRESH_METHODS = new Set(['map', 'filter', 'slice', 'concat', 'flat', 'flatMap', 'split']);
const FRESH_STATICS = new Map([
  ['Array', new Set(['from', 'of'])],
  ['Object', new Set(['keys', 'values', 'entries'])],
]);
const WRAPPERS = new Set(['TSAsExpression', 'TSNonNullExpression', 'TSSatisfiesExpression']);

function unwrapped(node) {
  return chainOf(node, (link) => (WRAPPERS.has(link.type) ? link.expression : undefined)).at(-1);
}

function isFreshArray(node) {
  const value = unwrapped(node);
  if (value.type === 'ArrayExpression') {
    return true;
  }
  const callee = value.type === 'CallExpression' ? unwrapped(value.callee) : undefined;
  if (callee?.type !== 'MemberExpression' || callee.computed) {
    return false;
  }
  const owner = callee.object.type === 'Identifier' ? callee.object.name : undefined;
  return (
    FRESH_STATICS.get(owner)?.has(callee.property.name) ?? FRESH_METHODS.has(callee.property.name)
  );
}

function hasMember(services, receiver, name) {
  const checker = services.program.getTypeChecker();
  return (
    checker.getApparentType(services.getTypeAtLocation(receiver)).getProperty(name) !== undefined
  );
}

function renamedProperty(member, name) {
  const { property } = member;
  if (!member.computed) {
    return replacing(property.range, name);
  }
  const quote = property.type === 'Literal' ? property.raw[0] : undefined;
  return quote === "'" || quote === '"'
    ? replacing(property.range, `${quote}${name}${quote}`)
    : undefined;
}

export function copyingMethodFix(services, member, method) {
  const copying = COPYING_FORMS.get(method);
  const call = member.parent;
  const isPlainCall = call.type === 'CallExpression' && call.callee === member && !call.optional;
  if (copying === undefined || !isPlainCall || call.parent.type === 'ExpressionStatement') {
    return undefined;
  }
  const copiesFreshArray =
    isFreshArray(member.object) && hasMember(services, member.object, copying);
  return copiesFreshArray ? renamedProperty(member, copying) : undefined;
}
