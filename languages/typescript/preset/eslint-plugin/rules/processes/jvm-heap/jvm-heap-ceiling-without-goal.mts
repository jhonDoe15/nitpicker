import { type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { isTestFile } from '../../analysis/test-files/test-file-path.mts';
import { displayName, trackedBindings } from '../process-callees.mts';
import { optionsArgument } from '../process-timeout-options.mts';
import { trackedProcessMethod } from '../support/process-command-helpers.mts';
import { hasHeapCeilingWithoutGoal, isJavaCommand } from './jvm-flags.mts';
import { isInRepeatedContext } from './repeated-context.mts';

type Candidate = {
  readonly node: TSESTree.CallExpression;
  readonly method: string;
};

export const rule: TSESLint.RuleModule<'jvmHeapCeilingWithoutGoal'> = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require a JVM heap-goal flag alongside a heap ceiling when starting JVMs in a loop or pool',
    },
    schema: [],
    messages: {
      jvmHeapCeilingWithoutGoal:
        'Starting a JVM via {{method}} in a loop or pool with a heap ceiling but no heap-goal flag lets each JVM grow to the ceiling, so concurrent JVMs together hold far more than their live data. Add -XX:GCTimeRatio=4 (or -XX:SoftMaxHeapSize with ZGC) next to the ceiling.',
    },
  },
  create(context) {
    if (isTestFile(context.filename)) {
      return {};
    }
    const candidates: Candidate[] = [];
    return trackedBindings('promisified-imports-and-aliases', (current) => ({
      CallExpression(node) {
        const method = trackedProcessMethod(node, current());
        if (method === undefined || !isJavaCommand(context, node.arguments[0])) {
          return;
        }
        const options = optionsArgument(context, node, false);
        if (hasHeapCeilingWithoutGoal(context, node, options)) {
          candidates.push({ node, method });
        }
      },
      'Program:exit'() {
        for (const candidate of candidates) {
          if (isInRepeatedContext(context.sourceCode, candidate.node)) {
            context.report({
              node: candidate.node,
              messageId: 'jvmHeapCeilingWithoutGoal',
              data: { method: displayName(candidate.method) },
            });
          }
        }
      },
    }));
  },
};
