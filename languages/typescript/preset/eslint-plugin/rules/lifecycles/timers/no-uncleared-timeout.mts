import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { perItemMethod } from '../shared/per-item.mts';
import { nearestFunction } from '../shared/scopes.mts';
import {
  abandonsPromiseTimer,
  clearsTimeouts,
  discardedTimeout,
  disposableClass,
  guardsLiveness,
  inEffectCallback,
  nearestClass,
  promiseExecutor,
  reactComponent,
  stateSetters,
  updatesComponent,
  usesThis,
} from './timeout-contexts.mts';

type MessageId = 'promise' | 'component' | 'owner';

const FORMS =
  'Keep the handle and clear it when the work settles (`finally`), on unmount (effect cleanup) or in dispose, or pass an AbortSignal the owner aborts.';
const EXCEPTION = ' An exception fits only when the callback must run after the owner is gone.';

type Finding = { readonly messageId: MessageId; readonly data?: { readonly method: string } };

function componentFinding(
  call: TSESTree.CallExpression,
  callback: TSESTree.Node,
): Finding | undefined {
  const component = reactComponent(call);
  const handler = nearestFunction(call);
  const reported =
    handler !== undefined &&
    handler !== component &&
    component !== undefined &&
    !inEffectCallback(call, component) &&
    updatesComponent(callback, stateSetters(component)) &&
    !clearsTimeouts(component);
  return reported ? { messageId: 'component' } : undefined;
}

function ownerFinding(call: TSESTree.CallExpression, callback: TSESTree.Node): Finding | undefined {
  const classBody = nearestClass(call);
  const perItem = classBody === undefined ? undefined : perItemMethod(call);
  const reported =
    classBody !== undefined &&
    perItem !== undefined &&
    disposableClass(classBody) &&
    usesThis(callback) &&
    !clearsTimeouts(classBody);
  return reported ? { messageId: 'owner', data: { method: perItem.name } } : undefined;
}

function findingFor(call: TSESTree.CallExpression, callback: TSESTree.Node): Finding | undefined {
  const executor = promiseExecutor(call);
  if (executor !== undefined) {
    return abandonsPromiseTimer(executor, callback) ? { messageId: 'promise' } : undefined;
  }
  return reactComponent(call) === undefined
    ? ownerFinding(call, callback)
    : componentFinding(call, callback);
}

export const rule: TSESLint.RuleModule<MessageId> = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require a setTimeout started per call or per event to be cleared when its work finishes or its owner goes away',
    },
    schema: [],
    messages: {
      promise: `This setTimeout rejects or aborts the promise after a delay, but its handle is dropped, so the timer stays armed after the promise settles another way and keeps the process and the closure alive. ${FORMS}${EXCEPTION}`,
      component: `This setTimeout in an event handler updates state and its handle is dropped, so it runs after the component unmounts and stacks when the handler runs again. Keep the id in a ref, clear it before starting a new one and in an effect cleanup.${EXCEPTION}`,
      owner: `This setTimeout in {{method}}() runs per event, calls back into the instance and its handle is dropped, so it fires after the instance is disposed and stacks when the method runs again. ${FORMS}${EXCEPTION}`,
    },
  },
  create(context) {
    return {
      CallExpression(call: TSESTree.CallExpression) {
        const callback = discardedTimeout(call);
        const [, delay] = call.arguments;
        const immediate = delay?.type === AST_NODE_TYPES.Literal && delay.value === 0;
        if (callback === undefined || immediate || guardsLiveness(callback)) {
          return;
        }
        const finding = findingFor(call, callback);
        if (finding !== undefined) {
          context.report({ node: call, ...finding });
        }
      },
    };
  },
};
