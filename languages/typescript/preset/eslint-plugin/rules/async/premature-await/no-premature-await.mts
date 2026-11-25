import type { TSESLint, TSESTree } from '@typescript-eslint/utils';
import type { SourceCode } from '../../typed/node-views.mts';
import {
  firstReadStatementIndex,
  hasNonTrivialCall,
  isInsideTryWithFinally,
  mutatesTaskTarget,
  waitBindingOf,
} from './await-analysis.mts';

type MessageId = 'prematureAwait';
type RuleContext = Readonly<TSESLint.RuleContext<MessageId, readonly []>>;

const MIN_STATEMENT_DISTANCE = 3;
const MAX_TASK_TEXT = 40;

function taskText(sourceCode: SourceCode, target: TSESTree.Node): string {
  const text = sourceCode.getText(target).replaceAll(/\s+/gu, ' ');
  return text.length > MAX_TASK_TEXT ? `${text.slice(0, MAX_TASK_TEXT)}...` : text;
}

function inspectWait(
  context: RuleContext,
  statements: readonly TSESTree.Statement[],
  waitIndex: number,
): void {
  const binding = waitBindingOf(context.sourceCode, statements[waitIndex]);
  if (binding === undefined) {
    return;
  }
  const readIndex = firstReadStatementIndex(binding, statements, waitIndex);
  if (readIndex === undefined || readIndex - waitIndex < MIN_STATEMENT_DISTANCE) {
    return;
  }
  const between = statements.slice(waitIndex + 1, readIndex);
  if (
    !hasNonTrivialCall(between) ||
    mutatesTaskTarget(context.sourceCode, between, binding.target)
  ) {
    return;
  }
  context.report({
    node: binding.statement,
    messageId: 'prematureAwait',
    data: { task: taskText(context.sourceCode, binding.target) },
  });
}

function inspectStatements(
  context: RuleContext,
  host: TSESTree.Node,
  statements: readonly TSESTree.Statement[],
): void {
  if (statements.length <= MIN_STATEMENT_DISTANCE || isInsideTryWithFinally(host)) {
    return;
  }
  for (let index = 0; index < statements.length - MIN_STATEMENT_DISTANCE; index += 1) {
    inspectWait(context, statements, index);
  }
}

export const rule: TSESLint.RuleModule<MessageId> = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Move `await` on an already-started task to where its result is first used so independent work can overlap',
    },
    schema: [],
    messages: {
      prematureAwait: [
        'Waiting for `{{task}}` here blocks independent work that does not use its result.',
        'Move the `await` to where the result is first used so the independent work can overlap',
        'with `{{task}}`, after verifying that the later work does not rely on `{{task}}` having',
        'finished.',
      ].join(' '),
    },
  },
  defaultOptions: [],
  create(context) {
    return {
      BlockStatement(node) {
        inspectStatements(context, node, node.body);
      },
      Program(node) {
        inspectStatements(context, node, node.body);
      },
      SwitchCase(node) {
        inspectStatements(context, node, node.consequent);
      },
    };
  },
};
