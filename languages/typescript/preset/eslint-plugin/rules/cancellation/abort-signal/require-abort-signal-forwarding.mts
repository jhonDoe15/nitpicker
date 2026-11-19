import type { TSESLint, TSESTree } from '@typescript-eslint/utils';
import { typedServices } from '../../decided/facts.mts';
import { forwardingHandlers } from './forwarding-check.mts';
import { infiniteLoopHandlers } from './loop-check.mts';

type MessageId = 'notForwarded' | 'loopIgnoresSignal';

export const rule: TSESLint.RuleModule<
  MessageId,
  readonly [],
  { readonly requiresTypeChecking: boolean }
> = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Report an awaited call that is not given the AbortSignal in scope, and an endless loop that never reads it',
      requiresTypeChecking: false,
    },
    schema: [],
    messages: {
      notForwarded:
        'This function has an AbortSignal, but `{{callee}}` accepts one (`{{parameter}}`) and does not get it, so the work goes on after cancellation. Pass the signal on: `{{callee}}(..., { signal })`. An exception fits only when the call must finish even after cancellation.',
      loopIgnoresSignal:
        'This endless loop awaits but never reads the AbortSignal `{{name}}` in scope, so it keeps running after cancellation. Pass the signal to the awaited calls, or test `{{name}}.aborted` in the loop condition (or call `{{name}}.throwIfAborted()`).',
    },
  },
  create(context) {
    const services = context.sourceCode.parserServices;
    const typed = typedServices(services) ? services : undefined;
    const signals = {
      checker: typed?.program.getTypeChecker(),
      typeOf: (node: TSESTree.Node) => {
        if (typed === undefined) {
          throw new TypeError('Types are needed to read a type.');
        }
        return typed.getTypeAtLocation(node);
      },
    };
    return {
      ...forwardingHandlers(context, typed, signals),
      ...infiniteLoopHandlers(context, signals),
    };
  },
};
