import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { calledMember, memberName, numberValue, outerOf, unwrapped } from '../../repeated-runs.mts';
import { isIndexZero } from '../../sorted-extreme.mts';

export type ExtremeForm = {
  readonly direction: 'first' | 'last';
  readonly replaced: TSESTree.Node;
  readonly destructured?: TSESTree.VariableDeclarator;
};

const FIRST = 'first';
const LAST = 'last';
const ENDS = new Map<string, ExtremeForm['direction']>([
  ['shift', FIRST],
  ['pop', LAST],
]);

function atDirection(call: TSESTree.CallExpression): ExtremeForm['direction'] | undefined {
  const [argument] = call.arguments;
  const position = numberValue(argument);
  if (call.arguments.length !== 1 || position === undefined) {
    return undefined;
  }
  if (position === 0) {
    return FIRST;
  }
  return position === -1 ? LAST : undefined;
}

function directionOf(
  call: TSESTree.CallExpression,
  name: string,
): ExtremeForm['direction'] | undefined {
  if (name === 'at') {
    return atDirection(call);
  }
  return call.arguments.length === 0 ? ENDS.get(name) : undefined;
}

function methodForm(member: TSESTree.MemberExpression): ExtremeForm | undefined {
  const call = member.parent;
  const name = memberName(member);
  if (
    call.type !== AST_NODE_TYPES.CallExpression ||
    calledMember(call) !== member ||
    call.optional ||
    member.optional ||
    name === undefined
  ) {
    return undefined;
  }
  const direction = directionOf(call, name);
  return direction === undefined ? undefined : { direction, replaced: call };
}

function memberForm(
  call: TSESTree.CallExpression,
  member: TSESTree.MemberExpression,
): ExtremeForm | undefined {
  if (member.object !== call) {
    return undefined;
  }
  if (member.computed) {
    return isIndexZero(member.property) && !member.optional
      ? { direction: FIRST, replaced: member }
      : undefined;
  }
  return methodForm(member);
}

function destructuringForm(
  call: TSESTree.CallExpression,
  declarator: TSESTree.VariableDeclarator,
): ExtremeForm | undefined {
  const { id } = declarator;
  const [element] = id.type === AST_NODE_TYPES.ArrayPattern ? id.elements : [];
  return declarator.init === call &&
    id.type === AST_NODE_TYPES.ArrayPattern &&
    id.elements.length === 1 &&
    id.typeAnnotation === undefined &&
    element?.type === AST_NODE_TYPES.Identifier
    ? { direction: FIRST, replaced: call, destructured: declarator }
    : undefined;
}

export function extremeForm(call: TSESTree.CallExpression): ExtremeForm | undefined {
  const { parent } = call;
  if (outerOf(call) !== call || call.optional) {
    return undefined;
  }
  if (parent.type === AST_NODE_TYPES.MemberExpression) {
    return memberForm(call, parent);
  }
  return parent.type === AST_NODE_TYPES.VariableDeclarator
    ? destructuringForm(call, parent)
    : undefined;
}

export function hasOptionalContinuation(node: TSESTree.Node): boolean {
  const next = node.parent;
  return (
    (next?.type === AST_NODE_TYPES.MemberExpression ||
      next?.type === AST_NODE_TYPES.CallExpression) &&
    next.optional &&
    unwrapped(next.type === AST_NODE_TYPES.MemberExpression ? next.object : next.callee) === node
  );
}
