import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { isFunctionNode } from '../scope/close-scopes.mts';
import { nameOf } from '../../typed/node-views.mts';
import { calleeProperty, callsIn, nearestClass } from '../shared/scopes.mts';
import { perItemMethod } from '../shared/per-item.mts';
import {
  clearsStore,
  isLazyInit,
  registrationOf,
  removesItself,
  replacesPrevious,
} from './registration-calls.mts';

type MessageId = 'store' | 'process';

const EXCEPTION = ' An exception fits only when the method is meant to run once.';
const PROCESS_RELEASES = new Set<string>(['off', 'removeListener', 'removeAllListeners']);

function isCreatedHandler(node: TSESTree.Node | undefined): boolean {
  return node !== undefined && isFunctionNode(node);
}

function processListener(call: TSESTree.CallExpression): boolean {
  const { callee } = call;
  return (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    !callee.computed &&
    nameOf(callee.object) === 'process' &&
    (nameOf(callee.property) === 'on' || nameOf(callee.property) === 'addListener') &&
    isCreatedHandler(call.arguments[1])
  );
}

function removesProcessListener(method: TSESTree.Node): boolean {
  return callsIn(method).some(
    (call) =>
      PROCESS_RELEASES.has(calleeProperty(call) ?? '') &&
      call.callee.type === AST_NODE_TYPES.MemberExpression &&
      nameOf(call.callee.object) === 'process',
  );
}

export const rule: TSESLint.RuleModule<MessageId> = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow a per-call method from registering a disposable or process listener that lives as long as its owner',
    },
    schema: [],
    messages: {
      store: `{{store}} runs in {{method}}(), which runs once per event or item, so every call leaves one more disposable in the owner's store until the owner is disposed. Register it once in the constructor or a field initializer, keep a per-call handle in a \`MutableDisposable\` or a store that is cleared when the work ends, or return the disposable to the caller.${EXCEPTION}`,
      process: `process.on(...) runs in {{method}}(), which runs once per event or item, so every call adds another process listener that nothing removes. Keep the handler in a variable and remove it with process.off() when the work ends, or register it once.${EXCEPTION}`,
    },
  },
  create(context) {
    const { sourceCode } = context;
    return {
      CallExpression(call: TSESTree.CallExpression) {
        const classBody = nearestClass(call);
        if (classBody === undefined) {
          return;
        }
        const registration = registrationOf(sourceCode, call, classBody);
        const process = registration === undefined && processListener(call);
        const perItem = registration === undefined && !process ? undefined : perItemMethod(call);
        if (perItem === undefined || isLazyInit(perItem.method)) {
          return;
        }
        const data = { method: perItem.name };
        if (
          registration !== undefined &&
          !replacesPrevious(call, perItem.method) &&
          !removesItself(registration, sourceCode) &&
          !clearsStore(registration, classBody, sourceCode)
        ) {
          context.report({
            node: call,
            messageId: 'store',
            data: { ...data, store: registration.label },
          });
        } else if (process && !removesProcessListener(perItem.method)) {
          context.report({ node: call, messageId: 'process', data });
        }
      },
    };
  },
};
