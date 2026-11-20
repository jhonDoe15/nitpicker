import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { nameOf } from '../typed/node-views.mts';
import { unwrapped } from '../typed/syntax-views.mts';

const NAME_LIKE =
  /(?:name|title|label|url|uri|path|dir|host|mode|token|id|message|stack|file|slug|key|locale|scope|mime|type)$/iu;
const FRESH_VALUES = new Set([
  AST_NODE_TYPES.CallExpression,
  AST_NODE_TYPES.NewExpression,
  AST_NODE_TYPES.AwaitExpression,
]);

export type MemberDefault = {
  readonly member: TSESTree.Node;
  readonly fallback: TSESTree.Node;
  readonly classes: ReadonlySet<string>;
  readonly operands: number;
};

function memberName(node: TSESTree.Node): string | undefined {
  const target = unwrapped(node);
  if (target.type !== AST_NODE_TYPES.MemberExpression) {
    return target.type === AST_NODE_TYPES.Identifier ? target.name : undefined;
  }
  return target.computed ? undefined : nameOf(target.property);
}

export function isComputedMember(node: TSESTree.Node): boolean {
  const target = unwrapped(node);
  return target.type === AST_NODE_TYPES.MemberExpression && target.computed;
}

function isTextLiteral(node: TSESTree.Node): boolean {
  return (
    (node.type === AST_NODE_TYPES.Literal && typeof node.value === 'string') ||
    node.type === AST_NODE_TYPES.TemplateLiteral
  );
}

function isStringDefaultOfAbsentText({ member, fallback }: MemberDefault): boolean {
  return (
    isTextLiteral(fallback) ||
    FRESH_VALUES.has(unwrapped(fallback).type) ||
    NAME_LIKE.test(memberName(member) ?? '') ||
    NAME_LIKE.test(memberName(fallback) ?? '')
  );
}

function isFlagChain({ member, fallback, operands }: MemberDefault): boolean {
  const target = unwrapped(fallback);
  const sameName = memberName(member) === memberName(target);
  const absent = target.type === AST_NODE_TYPES.Identifier && target.name === 'undefined';
  return operands > 1 || (target.type !== AST_NODE_TYPES.Literal && !absent && !sameName);
}

export function isIntentionalMemberDefault(use: MemberDefault): boolean {
  const { classes } = use;
  if (classes.size !== 1) {
    return false;
  }
  if (classes.has('string')) {
    return isStringDefaultOfAbsentText(use);
  }
  return classes.has('boolean') && isFlagChain(use);
}
