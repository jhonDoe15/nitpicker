import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { ancestorsOf, type SourceCode } from '../../../../typed/node-views.mts';
import { isFunction } from '../../../../typed/syntax-views.mts';
import { callbackRole } from '../../repeated-runs.mts';

export type Slot = { readonly statement: TSESTree.Node; readonly indent: string };

function isListed(node: TSESTree.Node): boolean {
  const holder = node.parent;
  return (
    holder?.type === AST_NODE_TYPES.BlockStatement ||
    holder?.type === AST_NODE_TYPES.Program ||
    holder?.type === AST_NODE_TYPES.StaticBlock
  );
}

function reachable(call: TSESTree.Node): TSESTree.Node[] {
  const reached: TSESTree.Node[] = [];
  for (const ancestor of ancestorsOf(call)) {
    if (isFunction(ancestor) && callbackRole(ancestor) !== 'callback') {
      return reached;
    }
    if (isListed(ancestor)) {
      reached.push(ancestor);
    }
  }
  return reached;
}

function indentOf(sourceCode: SourceCode, statement: TSESTree.Node): string | undefined {
  const line = sourceCode.lines[statement.loc.start.line - 1] ?? '';
  const before = line.slice(0, statement.loc.start.column);
  return /^[ \t]*$/u.test(before) ? before : undefined;
}

export function insertionSlot(
  sourceCode: SourceCode,
  call: TSESTree.Node,
  declaration: TSESTree.Node,
): Slot | undefined {
  const statement = reachable(call)
    .filter((candidate) => candidate.range[0] >= declaration.range[1])
    .at(-1);
  const indent = statement === undefined ? undefined : indentOf(sourceCode, statement);
  return statement === undefined || indent === undefined ? undefined : { statement, indent };
}
