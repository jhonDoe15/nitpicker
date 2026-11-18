import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { findBooleanFix } from '../../../fixes/collections/find-boolean-fix.mts';
import { mapFlatFix } from '../../../fixes/collections/map-flat-fix.mts';
import { lengthCheckFix } from '../../../fixes/collections/length-check-fix.mts';
import { fixable } from '../../../fixes/support/descriptors.mts';
import type { Context } from '../../security/security-values.mts';
import { isNode, type SourceCode } from '../../typed/node-views.mts';
import {
  calledMember,
  memberName,
  numberValue,
  outerOf,
  unwrapped,
} from '../costly-forms/repeated-runs.mts';
import { appendAll } from '../../../../../../../shared/lists/lists.mts';

type MethodCall = { readonly call: TSESTree.CallExpression; readonly receiver: TSESTree.Node };
type LengthTest = { readonly receiver: string; readonly test: string };

const TEST_OWNERS = new Set<string>([
  AST_NODE_TYPES.IfStatement,
  AST_NODE_TYPES.WhileStatement,
  AST_NODE_TYPES.DoWhileStatement,
  AST_NODE_TYPES.ForStatement,
  AST_NODE_TYPES.ConditionalExpression,
]);
const EQUALITY = new Set(['===', '!==', '==', '!=']);
const NON_EMPTY = new Set(['>0', '!==0', '!=0', '>=1']);
const EMPTY = new Set(['===0', '==0', '<1']);
const MIRRORED = new Map([
  ['<', '>'],
  ['>', '<'],
  ['<=', '>='],
  ['>=', '<='],
]);

function methodCall(node: TSESTree.Node, name: string): MethodCall | undefined {
  const call = unwrapped(node);
  if (call.type !== AST_NODE_TYPES.CallExpression) {
    return undefined;
  }
  const member = calledMember(call);
  return member !== undefined && !member.computed && memberName(member) === name
    ? { call, receiver: unwrapped(member.object) }
    : undefined;
}

function isNothing(node: TSESTree.Node): boolean {
  const value = unwrapped(node);
  return (
    (value.type === AST_NODE_TYPES.Identifier && value.name === 'undefined') ||
    (value.type === AST_NODE_TYPES.Literal && value.value === null && value.raw === 'null')
  );
}

export function filterFirst(
  member: TSESTree.MemberExpression,
): TSESLint.ReportDescriptor<'filterFirst'> | undefined {
  const filtered = methodCall(member.object, 'filter');
  if (filtered === undefined) {
    return undefined;
  }
  const takesFirst = member.computed
    ? numberValue(member.property) === 0
    : memberName(member) === 'at' && isFirstCall(member);
  const outer = outerOf(member);
  const written =
    (outer.parent?.type === AST_NODE_TYPES.AssignmentExpression && outer.parent.left === outer) ||
    outer.parent?.type === AST_NODE_TYPES.UpdateExpression;
  const [test] = filtered.call.arguments;
  return takesFirst && !written && isCallback(test)
    ? { node: member, messageId: 'filterFirst' }
    : undefined;
}

function isFirstCall(member: TSESTree.MemberExpression): boolean {
  const call = outerOf(member).parent;
  return (
    call?.type === AST_NODE_TYPES.CallExpression &&
    call.arguments.length === 1 &&
    numberValue(call.arguments[0]) === 0
  );
}

function isBooleanUse(outer: TSESTree.Node): boolean {
  const { parent } = outer;
  if (parent === undefined) {
    return false;
  }
  if (TEST_OWNERS.has(parent.type)) {
    return 'test' in parent && parent.test === outer;
  }
  if (parent.type === AST_NODE_TYPES.UnaryExpression) {
    return parent.operator === '!';
  }
  if (parent.type === AST_NODE_TYPES.BinaryExpression && EQUALITY.has(parent.operator)) {
    return isNothing(parent.left === outer ? parent.right : parent.left);
  }
  return (
    parent.type === AST_NODE_TYPES.CallExpression &&
    parent.arguments.length === 1 &&
    parent.callee.type === AST_NODE_TYPES.Identifier &&
    parent.callee.name === 'Boolean'
  );
}

function isCallback(node: TSESTree.Node | undefined): boolean {
  const value = node === undefined ? undefined : unwrapped(node);
  return (
    value?.type === AST_NODE_TYPES.ArrowFunctionExpression ||
    value?.type === AST_NODE_TYPES.FunctionExpression ||
    (value?.type === AST_NODE_TYPES.Identifier && value.name !== 'undefined')
  );
}

function isInlineCallback(node: TSESTree.Node | undefined): boolean {
  const value = node === undefined ? undefined : unwrapped(node);
  return (
    value?.type === AST_NODE_TYPES.ArrowFunctionExpression ||
    value?.type === AST_NODE_TYPES.FunctionExpression
  );
}

export function findAsBoolean(
  context: Context,
  call: TSESTree.CallExpression,
): TSESLint.ReportDescriptor<'findAsBoolean'> | undefined {
  const found = methodCall(call, 'find');
  const [test] = found?.call.arguments ?? [];
  const takesCallback = found?.call.arguments.length === 1 && isInlineCallback(test);
  return found !== undefined && takesCallback && isBooleanUse(outerOf(call))
    ? fixable({ node: call, messageId: 'findAsBoolean' }, findBooleanFix(context, found))
    : undefined;
}

export function mapFlat(
  context: Context,
  call: TSESTree.CallExpression,
): TSESLint.ReportDescriptor<'mapFlat'> | undefined {
  const flat = methodCall(call, 'flat');
  const depth = flat?.call.arguments ?? [];
  const once = depth.length === 0 || (depth.length === 1 && numberValue(depth[0]) === 1);
  const map = flat === undefined ? undefined : methodCall(flat.receiver, 'map');
  return flat !== undefined && once && map !== undefined
    ? fixable({ node: call, messageId: 'mapFlat' }, mapFlatFix(context, call, map.call))
    : undefined;
}

function lengthTest(sourceCode: SourceCode, node: TSESTree.Node): LengthTest | undefined {
  const test = unwrapped(node);
  if (test.type !== AST_NODE_TYPES.BinaryExpression) {
    return undefined;
  }
  const lengthOnLeft = lengthRead(test.left) !== undefined;
  const length = lengthOnLeft ? test.left : test.right;
  const bound = lengthOnLeft ? test.right : test.left;
  const operator = lengthOnLeft ? test.operator : (MIRRORED.get(test.operator) ?? test.operator);
  const count = numberValue(bound);
  const read = lengthRead(length);
  if (read === undefined || count === undefined) {
    return undefined;
  }
  return {
    receiver: sourceCode.getText(unwrapped(read.object)),
    test: `${operator}${String(count)}`,
  };
}

const CALLS = new Set<string>([
  AST_NODE_TYPES.CallExpression,
  AST_NODE_TYPES.NewExpression,
  AST_NODE_TYPES.TaggedTemplateExpression,
  AST_NODE_TYPES.AwaitExpression,
]);

function hasCall(node: TSESTree.Node): boolean {
  const pending = [node];
  for (const current of pending) {
    if (CALLS.has(current.type)) {
      return true;
    }
    const parts = ['object', 'property', 'expression'].map((key): unknown =>
      Reflect.get(current, key),
    );
    appendAll(pending, parts.filter(isNode));
  }
  return false;
}

function lengthRead(node: TSESTree.Node): TSESTree.MemberExpression | undefined {
  const value = unwrapped(node);
  return value.type === AST_NODE_TYPES.MemberExpression &&
    !value.computed &&
    !value.optional &&
    memberName(value) === 'length'
    ? value
    : undefined;
}

export function lengthCheck(
  context: Context,
  logical: TSESTree.LogicalExpression,
): TSESLint.ReportDescriptor<'lengthCheck'> | undefined {
  if (logical.operator === '??') {
    return undefined;
  }
  const { sourceCode } = context;
  const length = lengthTest(sourceCode, logical.left);
  const method = logical.operator === '&&' ? 'some' : 'every';
  const tests = logical.operator === '&&' ? NON_EMPTY : EMPTY;
  const called = methodCall(logical.right, method);
  const same =
    length !== undefined &&
    called !== undefined &&
    tests.has(length.test) &&
    !hasCall(called.receiver) &&
    sourceCode.getText(called.receiver) === length.receiver;
  return same
    ? fixable(
        {
          node: logical.left,
          messageId: 'lengthCheck',
          data: { method, answer: String(method === 'every') },
        },
        lengthCheckFix(context, logical, called.receiver),
      )
    : undefined;
}
