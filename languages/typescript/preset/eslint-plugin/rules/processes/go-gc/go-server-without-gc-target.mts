import { type TSESLint } from '@typescript-eslint/utils';
import { isTestFile } from '../../analysis/test-files/test-file-path.mts';
import { displayName, trackedBindings } from '../process-callees.mts';
import { optionsArgument } from '../process-timeout-options.mts';
import { trackedProcessMethod } from '../support/process-command-helpers.mts';
import { lacksGoGcTarget } from './go-gc-env.mts';
import { isGoToolCall } from './go-tool-detection.mts';

export const rule: TSESLint.RuleModule<'missingGoGcTarget'> = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require an explicit GOGC or GOMEMLIMIT environment variable when starting a Go-built language or lint server',
    },
    schema: [],
    messages: {
      missingGoGcTarget:
        'Pass GOGC (for example GOGC: process.env.GOGC ?? "50") or GOMEMLIMIT in env when starting a Go-built tool via {{method}}. Without a GC target, the Go runtime defaults to GOGC=100 and can double its live heap before collecting, causing sharp memory spikes alongside the parent process.',
    },
  },
  create(context) {
    if (isTestFile(context.filename)) {
      return {};
    }
    return trackedBindings('promisified-imports-and-aliases', (current) => ({
      CallExpression(node) {
        const method = trackedProcessMethod(node, current());
        if (method === undefined || !isGoToolCall(context, node)) {
          return;
        }
        const options = optionsArgument(context, node, false);
        if (lacksGoGcTarget(context, node, options)) {
          context.report({
            node,
            messageId: 'missingGoGcTarget',
            data: { method: displayName(method) },
          });
        }
      },
    }));
  },
};
