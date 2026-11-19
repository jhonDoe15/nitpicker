import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import type { ModuleBindings } from '../analysis/subprocess-calls.mts';
import { perTestVisitors, subprocessBindings } from '../analysis/test-code-analysis.mts';

export function perTestSubprocessVisitors<MessageIds extends string>(
  context: Readonly<TSESLint.RuleContext<MessageIds, readonly unknown[]>>,
  report: { readonly messageId: MessageIds; readonly data?: Readonly<Record<string, unknown>> },
  isReported: (call: TSESTree.CallExpression, bindings: ModuleBindings) => boolean,
): TSESLint.RuleListener {
  let bindings: ModuleBindings = { named: new Map(), namespaces: new Set() };
  return {
    Program(node) {
      bindings = subprocessBindings(node);
    },
    ...perTestVisitors(context, (node) =>
      node.type === AST_NODE_TYPES.CallExpression && isReported(node, bindings)
        ? { messageId: report.messageId, data: report.data ?? {} }
        : undefined,
    ),
  };
}
