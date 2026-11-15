import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { key } from '../analysis/logic/term-views.mts';
import type { SourceCode } from '../typed/node-views.mts';
import { assignmentReport, erasingReport } from './operand-arithmetic.mts';
import { chainSlips } from './operand-chains.mts';
import { describeTerm, inBooleanContext, isStable, normalTerm } from './operand-terms.mts';

type MessageId =
  | 'sameOperand'
  | 'nanTest'
  | 'repeatedOperand'
  | 'impossible'
  | 'always'
  | 'implied'
  | 'covered'
  | 'erasingOperation'
  | 'misrefactoredAssignment';
type Report = TSESLint.ReportDescriptor<MessageId>;
type Text = Pick<SourceCode, 'getText'>;

const SELF_OPERATORS = new Set<string>(['<', '<=', '>', '>=', '-', '/', '%', '&', '|', '^']);
const NAN_TESTS = new Set<string>(['===', '!==', '==', '!=']);
const VALUE_READS = new Set<string>(['name', 'member', 'index']);

const FIX_COPY = ' One side was probably copied: fix the operand that was meant to differ.';

function sameOperandReport(node: TSESTree.BinaryExpression, sourceCode: Text): Report | undefined {
  const left = normalTerm(node.left, sourceCode, false);
  const right = normalTerm(node.right, sourceCode, false);
  if (!isStable(left) || key(left) !== key(right)) {
    return undefined;
  }
  const isNanTest = NAN_TESTS.has(node.operator) && VALUE_READS.has(left.kind);
  const messageId: MessageId = isNanTest ? 'nanTest' : 'sameOperand';
  return { node, messageId, data: { operand: describeTerm(left).text, operator: node.operator } };
}

function binaryReport(node: TSESTree.BinaryExpression, sourceCode: Text): Report | undefined {
  const isSelfOperator = SELF_OPERATORS.has(node.operator) || NAN_TESTS.has(node.operator);
  const same = isSelfOperator ? sameOperandReport(node, sourceCode) : undefined;
  return same ?? erasingReport(node, sourceCode);
}

function isChainHead(node: TSESTree.LogicalExpression): boolean {
  const parent = node.parent;
  return parent.type !== AST_NODE_TYPES.LogicalExpression || parent.operator !== node.operator;
}

export const rule: TSESLint.RuleModule<MessageId> = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow the same operand on both sides of an operator and comparisons that contradict or repeat each other',
    },
    schema: [],
    messages: {
      sameOperand: `\`{{operand}}\` is on both sides of \`{{operator}}\`.${FIX_COPY}`,
      nanTest: `\`{{operand}}\` is compared with itself. To test for NaN, write \`Number.isNaN({{operand}})\`.${FIX_COPY}`,
      repeatedOperand: `\`{{operand}}\` appears twice in this \`{{operator}}\` chain.${FIX_COPY}`,
      impossible:
        'These comparisons of one value cannot both hold, so this `&&` is always false. Fix the constant or operator that was copied.',
      always:
        'Together these comparisons of one value always hold, so this `||` is always true. Fix the constant or operator that was copied.',
      implied:
        '`{{redundant}}` already follows from `{{deciding}}`, so it checks nothing. Remove it, or fix its constant or operator.',
      covered:
        '`{{redundant}}` adds nothing: `{{deciding}}` holds whenever it does. Remove it, or fix its constant or operator.',
      erasingOperation:
        '`{{operator}} 0` erases `{{operand}}`: the result is 0 whatever it holds (or -0 or NaN with `*`). Write the value meant, or fix the operand.',
      misrefactoredAssignment:
        '`{{target}} {{operator}}=` already applies `{{target}}`, and the right side uses it again. Drop `{{target}}` from the right side, or write `{{target}} = ...` with the whole expression.',
    },
  },
  create(context) {
    const { sourceCode } = context;
    function report(found: Report | undefined): void {
      if (found !== undefined) {
        context.report(found);
      }
    }
    return {
      BinaryExpression(node) {
        report(binaryReport(node, sourceCode));
      },
      AssignmentExpression(node) {
        report(assignmentReport(node, sourceCode));
      },
      LogicalExpression(node) {
        if (node.operator === '??' || !isChainHead(node)) {
          return;
        }
        for (const slip of chainSlips(node, sourceCode, inBooleanContext(node))) {
          report({ node, ...slip });
        }
      },
    };
  },
};
