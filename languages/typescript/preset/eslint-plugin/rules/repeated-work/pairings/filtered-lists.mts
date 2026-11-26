import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { calledMember, memberName } from '../../collections/costly-forms/repeated-runs.mts';
import { variableNamed, type SourceCode } from '../../typed/node-views.mts';
import { unwrapped } from '../../typed/syntax-views.mts';

const KEEPING_STEPS = new Set(['map', 'slice', 'toReversed', 'toSorted']);

function sourceOf(sourceCode: SourceCode, node: TSESTree.Node): TSESTree.Node {
  const value = unwrapped(node);
  if (value.type !== AST_NODE_TYPES.Identifier) {
    return value;
  }
  const definition = variableNamed(sourceCode, value)?.defs[0];
  const declarator = definition?.node;
  return declarator?.type === AST_NODE_TYPES.VariableDeclarator &&
    declarator.parent.kind === 'const' &&
    declarator.init !== null
    ? unwrapped(declarator.init)
    : value;
}

export function filterOf(
  sourceCode: SourceCode,
  node: TSESTree.Node,
): TSESTree.CallExpression | undefined {
  const pending = [sourceOf(sourceCode, node)];
  for (const value of pending) {
    if (value.type !== AST_NODE_TYPES.CallExpression) {
      return undefined;
    }
    const member = calledMember(value);
    const name = member === undefined ? undefined : memberName(member);
    if (name === 'filter') {
      return value;
    }
    if (member === undefined || !KEEPING_STEPS.has(name ?? '')) {
      return undefined;
    }
    pending.push(unwrapped(member.object));
  }
  return undefined;
}

export function filteredOneSide(
  sourceCode: SourceCode,
  first: TSESTree.Node,
  second: TSESTree.Node,
): TSESTree.Node | undefined {
  const firstFilter = filterOf(sourceCode, first);
  const secondFilter = filterOf(sourceCode, second);
  if (firstFilter === undefined || secondFilter === undefined) {
    return firstFilter === undefined ? (secondFilter === undefined ? undefined : second) : first;
  }
  const text = (call: TSESTree.CallExpression) => call.arguments.map((a) => sourceCode.getText(a));
  return text(firstFilter).join() === text(secondFilter).join() ? undefined : first;
}

export function isPlainList(node: TSESTree.Node): boolean {
  const value = unwrapped(node);
  return (
    value.type === AST_NODE_TYPES.Identifier ||
    (value.type === AST_NODE_TYPES.MemberExpression &&
      !value.computed &&
      (value.object.type === AST_NODE_TYPES.ThisExpression || isPlainList(value.object)))
  );
}
