import {
  AST_NODE_TYPES,
  type ParserServicesWithTypeInformation,
  type TSESTree,
} from '@typescript-eslint/utils';
import { ASSERTION_FORMS, unwrapOf } from '../../rules/typed/syntax-views.mts';
import { replacing, type FixPlan } from '../support/ranges.mts';

const COPYING_FORMS = new Map([
  ['sort', 'toSorted'],
  ['reverse', 'toReversed'],
]);
const FRESH_METHODS = new Set(['map', 'filter', 'slice', 'concat', 'flat', 'flatMap', 'split']);
const FRESH_STATICS = new Map([
  ['Array', new Set(['from', 'of'])],
  ['Object', new Set(['keys', 'values', 'entries'])],
]);

function isFreshArray(node: TSESTree.Node): boolean {
  const value = unwrapOf(node, ASSERTION_FORMS);
  if (value.type === AST_NODE_TYPES.ArrayExpression) {
    return true;
  }
  const callee =
    value.type === AST_NODE_TYPES.CallExpression
      ? unwrapOf(value.callee, ASSERTION_FORMS)
      : undefined;
  if (callee?.type !== AST_NODE_TYPES.MemberExpression || callee.computed) {
    return false;
  }
  const owner = callee.object.type === AST_NODE_TYPES.Identifier ? callee.object.name : undefined;
  const statics = owner === undefined ? undefined : FRESH_STATICS.get(owner);
  return statics?.has(callee.property.name) ?? FRESH_METHODS.has(callee.property.name);
}

function hasMember(
  services: ParserServicesWithTypeInformation,
  receiver: TSESTree.Node,
  name: string,
): boolean {
  const checker = services.program.getTypeChecker();
  return (
    checker.getApparentType(services.getTypeAtLocation(receiver)).getProperty(name) !== undefined
  );
}

function renamedProperty(member: TSESTree.MemberExpression, name: string): FixPlan | undefined {
  const { property } = member;
  if (!member.computed) {
    return replacing(property.range, name);
  }
  const quote = property.type === AST_NODE_TYPES.Literal ? property.raw[0] : undefined;
  return quote === "'" || quote === '"'
    ? replacing(property.range, `${quote}${name}${quote}`)
    : undefined;
}

export function copyingMethodFix(
  services: ParserServicesWithTypeInformation,
  member: TSESTree.MemberExpression,
  method: string,
): FixPlan | undefined {
  const copying = COPYING_FORMS.get(method);
  const call = member.parent;
  const isPlainCall =
    call.type === AST_NODE_TYPES.CallExpression && call.callee === member && !call.optional;
  if (
    copying === undefined ||
    !isPlainCall ||
    call.parent.type === AST_NODE_TYPES.ExpressionStatement
  ) {
    return undefined;
  }
  const copiesFreshArray =
    isFreshArray(member.object) && hasMember(services, member.object, copying);
  return copiesFreshArray ? renamedProperty(member, copying) : undefined;
}
