import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import {
  calledMember,
  memberName,
  someNode,
} from '../../collections/costly-forms/repeated-runs.mts';
import type { SourceCode } from '../../typed/node-views.mts';
import { unwrapped } from '../../typed/syntax-views.mts';
import type { Repeat } from '../support/loop-invariance.mts';

const MUTATORS = new Set(['add', 'delete', 'push', 'set', 'splice', 'unshift']);

function iterated(repeat: Repeat): TSESTree.Node | undefined {
  if (repeat.node.type === AST_NODE_TYPES.ForOfStatement) {
    return repeat.node.right;
  }
  const call = repeat.kind === 'callback' ? repeat.node.parent : undefined;
  const member = call?.type === AST_NODE_TYPES.CallExpression ? calledMember(call) : undefined;
  return member?.object;
}

function isKeyList(sourceCode: SourceCode, node: TSESTree.Node, map: string): boolean {
  const value = unwrapped(node);
  if (value.type === AST_NODE_TYPES.NewExpression) {
    return value.callee.type === AST_NODE_TYPES.Identifier && value.callee.name === 'Set';
  }
  const member = value.type === AST_NODE_TYPES.CallExpression ? calledMember(value) : undefined;
  return (
    memberName(member ?? value) === 'keys' ||
    sourceCode.getText(value) === map ||
    (member !== undefined && sourceCode.getText(unwrapped(member.object)) === map)
  );
}

export function runsOncePerKey(
  sourceCode: SourceCode,
  repeat: Repeat,
  map: TSESTree.Node,
): boolean {
  const list = iterated(repeat);
  return list !== undefined && isKeyList(sourceCode, list, sourceCode.getText(unwrapped(map)));
}

export function changedInside(
  sourceCode: SourceCode,
  area: TSESTree.Node,
  receivers: readonly TSESTree.Node[],
): boolean {
  const texts = new Set(receivers.map((node) => sourceCode.getText(unwrapped(node))));
  return someNode(area, (node) => {
    const member = node.type === AST_NODE_TYPES.CallExpression ? calledMember(node) : undefined;
    return (
      member !== undefined &&
      MUTATORS.has(memberName(member) ?? '') &&
      texts.has(sourceCode.getText(unwrapped(member.object)))
    );
  });
}
