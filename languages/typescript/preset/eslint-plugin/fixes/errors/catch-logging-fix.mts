import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import type { SourceCode } from '../../rules/typed/node-views.mts';
import { hasCommentIn, replacing, type FixPlan } from '../support/ranges.mts';

function isMessage(node: TSESTree.Node): boolean {
  return (
    (node.type === AST_NODE_TYPES.Literal && typeof node.value === 'string') ||
    node.type === AST_NODE_TYPES.TemplateLiteral
  );
}

export function catchLoggingFix(
  sourceCode: SourceCode,
  call: TSESTree.CallExpression,
  isCaught: (argument: TSESTree.Node) => boolean,
): FixPlan | undefined {
  const [first, second] = call.arguments;
  if (
    first === undefined ||
    second === undefined ||
    call.arguments.length !== 2 ||
    hasCommentIn(sourceCode, call.range)
  ) {
    return undefined;
  }
  const caught = isCaught(first) ? first : second;
  const message = caught === first ? second : first;
  const text = `{ err: ${sourceCode.getText(caught)} }, ${sourceCode.getText(message)}`;
  return isCaught(caught) && isMessage(message)
    ? replacing([first.range[0], second.range[1]], text)
    : undefined;
}
