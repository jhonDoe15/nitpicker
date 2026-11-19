import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { nearestClass, nearestFunction } from '../shared/scopes.mts';
import { typeCheckedRule } from '../shared/type-checked-rule.mts';
import {
  boundedReceiver,
  isReleaseHandle,
  ownedEmitter,
  releasingClass,
  subscribingName,
} from './subscription-handles.mts';

export const rule = typeCheckedRule({
  description:
    'Disallow dropping the disposable or unsubscribe handle returned by an event subscription in a long-lived object',
  messages: {
    dropped:
      'The handle returned by {{name}}(...) is dropped, so this listener is never removed and keeps the object alive and firing after its owner is gone. Keep the handle and release it on dispose: register it with the disposable store (`this._register(...)`, `store.add(...)`), assign it to a field that dispose() releases, or use `once`. An exception fits only when the emitter is owned by and dies with this object.',
  },
  listeners: ({ context, sourceCode, checker, nodeMap }) => ({
    ExpressionStatement(statement: TSESTree.ExpressionStatement) {
      const { expression } = statement;
      const call =
        expression.type === AST_NODE_TYPES.ChainExpression ? expression.expression : expression;
      if (call.type !== AST_NODE_TYPES.CallExpression) {
        return;
      }
      const name = subscribingName(call);
      const classBody = nearestClass(statement);
      const moduleLevel = nearestFunction(statement) === undefined && classBody === undefined;
      const longLived = moduleLevel || (classBody !== undefined && releasingClass(classBody));
      if (
        name === undefined ||
        !longLived ||
        boundedReceiver(sourceCode, call) ||
        (classBody !== undefined && ownedEmitter(classBody, call))
      ) {
        return;
      }
      const node = nodeMap.get(call);
      if (isReleaseHandle(checker, checker.getTypeAtLocation(node), node)) {
        context.report({
          node: call,
          messageId: 'dropped',
          data: { name: sourceCode.getText(call.callee) },
        });
      }
    },
  }),
});
