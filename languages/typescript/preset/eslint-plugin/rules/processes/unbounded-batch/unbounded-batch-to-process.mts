import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { isTestFile } from '../../analysis/test-files/test-file-path.mts';
import { calleeMethod, displayName, trackedBindings } from '../process-callees.mts';
import { calleeIdentifierOrMember, PROCESS_METHODS } from '../support/process-command-helpers.mts';
import {
  isInsideBatchLoop,
  isUnboundedCollectionSpread,
  resolveArgsArray,
} from './batch-analysis.mts';

function matchedMethod(
  node: TSESTree.CallExpression,
  resolved: string | undefined,
): string | undefined {
  if (resolved !== undefined && PROCESS_METHODS.has(resolved)) {
    return resolved;
  }
  return calleeIdentifierOrMember(node) === 'spawnAsync' ? 'spawnAsync' : undefined;
}

export const rule: TSESLint.RuleModule<'unboundedBatchToProcess'> = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow spreading an unbounded file or item list into a single child process invocation',
    },
    schema: [],
    messages: {
      unboundedBatchToProcess:
        'Passing an unbounded file or item list to {{method}} in a single child process lets memory grow without bound. Split the list into bounded batches and invoke the process per batch.',
    },
  },
  create(context) {
    if (isTestFile(context.filename)) {
      return {};
    }
    return trackedBindings('promisified-imports-and-aliases', (current) => ({
      CallExpression(node) {
        const method = matchedMethod(node, calleeMethod(node.callee, current()));
        if (method === undefined || isInsideBatchLoop(node)) {
          return;
        }
        const argsArray = resolveArgsArray(context, node.arguments[1]);
        if (argsArray === undefined) {
          return;
        }
        for (const element of argsArray.elements) {
          if (
            element?.type === AST_NODE_TYPES.SpreadElement &&
            isUnboundedCollectionSpread(context.sourceCode, element.argument)
          ) {
            context.report({
              node: element,
              messageId: 'unboundedBatchToProcess',
              data: { method: displayName(method) },
            });
          }
        }
      },
    }));
  },
};
