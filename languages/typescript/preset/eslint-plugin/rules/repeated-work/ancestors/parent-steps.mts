import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { memberName } from '../../collections/costly-forms/repeated-runs.mts';
import { unwrapped } from '../../typed/syntax-views.mts';

type Loop = TSESTree.ForStatement | TSESTree.WhileStatement | TSESTree.DoWhileStatement;

const PARENT_LINKS = new Set(['parent', 'parentElement', 'parentNode', 'parentPath']);
const PARENT_CALLS = new Set(['getParent', 'getParentNode']);

function isParentOf(value: TSESTree.Node, name: string): boolean {
  const step = unwrapped(value);
  const link =
    step.type === AST_NODE_TYPES.CallExpression && step.arguments.length === 0
      ? unwrapped(step.callee)
      : step;
  if (link.type !== AST_NODE_TYPES.MemberExpression) {
    return false;
  }
  const object = unwrapped(link.object);
  const property = memberName(link) ?? '';
  const names = link === step ? PARENT_LINKS : PARENT_CALLS;
  return object.type === AST_NODE_TYPES.Identifier && object.name === name && names.has(property);
}

function parentStep(node: TSESTree.Node | null | undefined): string | undefined {
  const step =
    node?.type === AST_NODE_TYPES.ExpressionStatement ? node.expression : (node ?? undefined);
  if (
    step?.type !== AST_NODE_TYPES.AssignmentExpression ||
    step.operator !== '=' ||
    step.left.type !== AST_NODE_TYPES.Identifier
  ) {
    return undefined;
  }
  return isParentOf(step.right, step.left.name) ? step.left.name : undefined;
}

export function climbingName(loop: TSESTree.Node): string | undefined {
  if (loop.type === AST_NODE_TYPES.ForStatement) {
    return parentStep(loop.update);
  }
  if (
    loop.type !== AST_NODE_TYPES.WhileStatement &&
    loop.type !== AST_NODE_TYPES.DoWhileStatement
  ) {
    return undefined;
  }
  const statements =
    loop.body.type === AST_NODE_TYPES.BlockStatement ? loop.body.body : [loop.body];
  return statements.map(parentStep).find((name) => name !== undefined);
}
