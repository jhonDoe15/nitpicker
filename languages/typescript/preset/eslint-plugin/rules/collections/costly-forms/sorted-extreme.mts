import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import type { SourceCode } from '../../typed/node-views.mts';
import { isReadAfterSort } from './receivers/later-reads.mts';
import {
  calledMember,
  memberName,
  methodCallOn,
  numberValue,
  outerOf,
  unwrapped,
} from './repeated-runs.mts';

type Finding = TSESLint.ReportDescriptor<'sortForExtreme'>;

const SORTS = new Set(['sort', 'toSorted']);
const ENDS = new Set(['pop', 'shift']);
const FIRST = 0;
const LAST = -1;

export function isIndexZero(property: TSESTree.Node): boolean {
  const value = unwrapped(property);
  return (
    numberValue(value) === FIRST || (value.type === AST_NODE_TYPES.Literal && value.value === '0')
  );
}

function isFirstElementRead(member: TSESTree.MemberExpression): boolean {
  const outer = outerOf(member);
  const { parent } = outer;
  const written =
    (parent?.type === AST_NODE_TYPES.AssignmentExpression && parent.left === outer) ||
    (parent?.type === AST_NODE_TYPES.UpdateExpression && parent.argument === outer) ||
    (parent?.type === AST_NODE_TYPES.UnaryExpression && parent.operator === 'delete');
  return member.computed && !written && isIndexZero(member.property);
}

function takesEnd(call: TSESTree.CallExpression): boolean {
  const outer = outerOf(call);
  const { parent } = outer;
  if (parent?.type === AST_NODE_TYPES.VariableDeclarator && parent.init === outer) {
    const { id } = parent;
    return (
      id.type === AST_NODE_TYPES.ArrayPattern &&
      id.elements.length === 1 &&
      id.elements[0]?.type !== AST_NODE_TYPES.RestElement
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
  if (method.name !== undefined && ENDS.has(method.name)) {
    return args.length === 0;
  }
  const position = numberValue(args[0]);
  return (
    method.name === 'at' &&
    args.length === 1 &&
    position !== undefined &&
    [FIRST, LAST].includes(position)
  );
}

function sortsSharedArray(
  sourceCode: SourceCode,
  member: TSESTree.MemberExpression,
  call: TSESTree.CallExpression,
): boolean {
  if (memberName(member) !== 'sort') {
    return false;
  }
  const receiver = unwrapped(member.object);
  if (receiver.type === AST_NODE_TYPES.Identifier) {
    return isReadAfterSort(sourceCode, receiver, call);
  }
  return (
    receiver.type === AST_NODE_TYPES.MemberExpression ||
    receiver.type === AST_NODE_TYPES.ThisExpression
  );
}

export function sortedExtreme(
  sourceCode: SourceCode,
  call: TSESTree.CallExpression,
): Finding | undefined {
  const member = calledMember(call);
  const method = member === undefined ? undefined : memberName(member);
  if (member === undefined || method === undefined || !SORTS.has(method) || !takesEnd(call)) {
    return undefined;
  }
  if (sortsSharedArray(sourceCode, member, call)) {
    return undefined;
  }
  return { node: call, messageId: 'sortForExtreme', data: { method } };
}
