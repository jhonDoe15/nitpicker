import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';

type Statement = TSESTree.Statement;
export type MaybeStatement = TSESTree.IfStatement['alternate'] | undefined;

const JUMPS = new Map([
  ['ReturnStatement', 'returns'],
  ['ThrowStatement', 'throws'],
  ['BreakStatement', 'breaks'],
  ['ContinueStatement', 'continues'],
]);

export function statementsOf(node: MaybeStatement): readonly Statement[] {
  if (node === null || node === undefined) {
    return [];
  }
  return node.type === AST_NODE_TYPES.BlockStatement ? node.body : [node];
}

function lastStatement(node: MaybeStatement): Statement | undefined {
  return statementsOf(node).at(-1);
}

function isLeavingBoth(
  statement: Statement | undefined,
): statement is TSESTree.IfStatement & { readonly alternate: Statement } {
  return statement?.type === AST_NODE_TYPES.IfStatement && statement.alternate !== null;
}

export function exitOf(node: MaybeStatement): string | undefined {
  const last = lastStatement(node);
  const jump = last === undefined ? undefined : JUMPS.get(last.type);
  if (jump !== undefined) {
    return jump;
  }
  const pending: MaybeStatement[] = [node];
  for (const current of pending) {
    const final = lastStatement(current);
    if (isLeavingBoth(final)) {
      pending.push(final.consequent, final.alternate);
    } else if (final === undefined || !JUMPS.has(final.type)) {
      return undefined;
    }
  }
  return 'leaves';
}
