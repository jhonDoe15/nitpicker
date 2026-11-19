import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import type { ParserServicesWithTypeInformation } from '@typescript-eslint/utils';
import { unforwardedParameter } from './forwarding.mts';
import { signalsInScope, type Signals } from './signal-scope.mts';

type Context = Readonly<TSESLint.RuleContext<'notForwarded' | 'loopIgnoresSignal', readonly []>>;

function awaitedCall(node: TSESTree.AwaitExpression): TSESTree.CallExpression | undefined {
  const argument =
    node.argument.type === AST_NODE_TYPES.ChainExpression
      ? node.argument.expression
      : node.argument;
  return argument.type === AST_NODE_TYPES.CallExpression ? argument : undefined;
}

export function forwardingHandlers(
  context: Context,
  services: ParserServicesWithTypeInformation | undefined,
  signals: Signals,
): TSESLint.RuleListener {
  if (services === undefined || signals.checker === undefined) {
    return {};
  }
  const { checker } = signals;
  return {
    AwaitExpression(node) {
      const call = awaitedCall(node);
      if (
        call === undefined ||
        signalsInScope(context.sourceCode.getScope(node), signals).length === 0
      ) {
        return;
      }
      const tsCall = services.esTreeNodeToTSNodeMap.get(call);
      const parameter = unforwardedParameter(checker, tsCall, call);
      if (parameter !== undefined) {
        context.report({
          node: call,
          messageId: 'notForwarded',
          data: { callee: context.sourceCode.getText(call.callee), parameter },
        });
      }
    },
  };
}
