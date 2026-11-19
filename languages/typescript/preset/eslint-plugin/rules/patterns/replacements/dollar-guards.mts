import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { stringValue, type SourceContext } from '../../analysis/constant-resolution.mts';
import { calleeNameOf } from '../../typed/syntax-views.mts';

type Node = TSESTree.Node;

function isNoDollarTest(context: SourceContext, test: Node, text: string): boolean {
  if (test.type !== AST_NODE_TYPES.UnaryExpression || test.operator !== '!') {
    return false;
  }
  const call = test.argument;
  return (
    call.type === AST_NODE_TYPES.CallExpression &&
    call.callee.type === AST_NODE_TYPES.MemberExpression &&
    calleeNameOf(call.callee) === 'includes' &&
    stringValue(call.arguments[0]) === '$' &&
    context.sourceCode.getText(call.callee.object) === text
  );
}

export function hasDollarGuard(context: SourceContext, node: Node): boolean {
  const text = context.sourceCode.getText(node);
  const pending = [node];
  for (const child of pending) {
    const holder = child.parent ?? undefined;
    if (holder === undefined) {
      return false;
    }
    if (
      (holder.type === AST_NODE_TYPES.IfStatement ||
        holder.type === AST_NODE_TYPES.ConditionalExpression) &&
      holder.consequent === child &&
      isNoDollarTest(context, holder.test, text)
    ) {
      return true;
    }
    pending.push(holder);
  }
  return false;
}
