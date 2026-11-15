import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import type { SourceCode } from '../../rules/typed/node-views.mts';
import type { ExpectForm } from './expect-forms.mts';
import { lengthName, nonEmptyComparison, nullishName } from './values.mts';

export const EXCEPTION_ROUTE = 'An exception fits only when the value cannot be pinned.';

function sideText(sourceCode: SourceCode, node: TSESTree.Node | undefined): string {
  const length = lengthName(node);
  if (length !== undefined) {
    return `….${length}`;
  }
  const isFixed = node?.type === AST_NODE_TYPES.Literal || nullishName(node) !== undefined;
  return isFixed ? sourceCode.getText(node) : '…';
}

function argumentsText(sourceCode: SourceCode, args: readonly TSESTree.Node[]): string {
  return args.map((argument) => sourceCode.getText(argument)).join(', ');
}

function conditionText(sourceCode: SourceCode, condition: TSESTree.Node | undefined): string {
  if (condition?.type !== AST_NODE_TYPES.BinaryExpression) {
    return sideText(sourceCode, condition);
  }
  return [
    sideText(sourceCode, condition.left),
    condition.operator,
    sideText(sourceCode, condition.right),
  ].join(' ');
}

export function expectText(sourceCode: SourceCode, { expectation }: ExpectForm): string {
  const { subject, path, args } = expectation;
  const shown = nonEmptyComparison(subject) !== undefined || lengthName(subject) !== undefined;
  const subjectText = shown ? conditionText(sourceCode, subject) : '…';
  return `expect(${subjectText}).${path}(${argumentsText(sourceCode, args)})`;
}

export function assertText(sourceCode: SourceCode, call: TSESTree.CallExpression): string {
  const callee = sourceCode.getText(call.callee);
  const [first, second] = call.arguments;
  const inner =
    call.callee.type === AST_NODE_TYPES.Identifier || callee.endsWith('.ok')
      ? conditionText(sourceCode, first)
      : [sideText(sourceCode, first), sideText(sourceCode, second)].join(', ');
  return `${callee}(${inner})`;
}
