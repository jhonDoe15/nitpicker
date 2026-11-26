import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import type TypeScript from 'typescript';
import { typeCheckedRule } from '../lifecycles/shared/type-checked-rule.mts';
import { wordsOf as untypedWordsOf } from '../../../../../../shared/naming/secret-words.mts';
import { earlyWaits } from './started-work.mts';

const wordsOf: (name: string) => string[] = untypedWordsOf;
const SYNCHRONIZING = new Set([
  'lock',
  'mutex',
  'barrier',
  'ready',
  'init',
  'initialized',
  'shutdown',
  'flush',
  'close',
  'closed',
  'drain',
  'drained',
  'limit',
  'limiter',
  'sleep',
  'delay',
  'wait',
  'done',
  'exit',
  'exited',
  'end',
  'ended',
  'finish',
  'finished',
  'complete',
  'completed',
  'completion',
  'settled',
  'stop',
  'stopped',
]);

function guardedByTry(block: TSESTree.BlockStatement): boolean {
  return block.parent.type === AST_NODE_TYPES.TryStatement && block.parent.block === block;
}

function isPromise(checker: TypeScript.TypeChecker, node: TypeScript.Node): boolean {
  const type = checker.getNonNullableType(checker.getTypeAtLocation(node));
  const parts = type.isUnion() ? type.types : [type];
  return parts.every((part) => part.getSymbol()?.getName() === 'Promise');
}

export const rule = typeCheckedRule({
  description:
    'Wait for work started earlier where its result is first used, not before independent work',
  messages: {
    early: [
      '`await {{task}}` waits here for work started earlier, but its result is first used after',
      'independent work that starts at `{{next}}`. While this waits, nothing else runs.',
      'Move the wait to where the result is first used, so that the independent work overlaps with the task.',
      'An exception fits only when the later work relies on the task having finished',
      '(shared state, a file or row the task writes, a required order).',
    ].join(' '),
  },
  listeners: ({ context, sourceCode, checker, nodeMap }) => ({
    BlockStatement(block: TSESTree.BlockStatement) {
      if (guardedByTry(block)) {
        return;
      }
      for (const { wait, task, handle, next } of earlyWaits(block, sourceCode)) {
        if (
          !wordsOf(task).some((word) => SYNCHRONIZING.has(word)) &&
          isPromise(checker, nodeMap.get(handle))
        ) {
          const text = sourceCode.getText(next).split('\n')[0] ?? '';
          context.report({ node: wait, messageId: 'early', data: { task, next: text } });
        }
      }
    },
  }),
});
