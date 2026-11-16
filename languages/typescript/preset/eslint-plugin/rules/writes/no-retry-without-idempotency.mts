import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { callsWithin } from '../effects/held-scopes.mts';
import { enclosingLoop, isRetryAttempt } from '../loops/loop-shapes.mts';
import { isBindCall } from '../security/imported-names.mts';
import type { Context } from '../security/security-values.mts';
import { callEffects, describePath, referenceEffects } from '../support/io-effects.mts';
import { isCallback, type Callback } from '../typed/syntax-views.mts';
import { retryScope, type RetryScope } from './retry-scopes.mts';

type Reference = TSESTree.Identifier | TSESTree.MemberExpression;
type MaybeNode = TSESTree.Node | undefined;

const UNSAFE = 'unsafe';

function isReference(node: MaybeNode): node is Reference {
  return node?.type === AST_NODE_TYPES.Identifier || node?.type === AST_NODE_TYPES.MemberExpression;
}

function report(
  context: Context,
  {
    node,
    path,
    scope,
  }: { readonly node: TSESTree.Node; readonly path: string[]; readonly scope: string },
): void {
  context.report({ node, messageId: 'retry', data: { callee: describePath(path), scope } });
}

function checkRetriedFunction(context: Context, retried: Callback, label: string): void {
  for (const call of callsWithin(retried.body, context.sourceCode.visitorKeys)) {
    const path = callEffects(call, context).get(UNSAFE);
    if (path !== undefined) {
      report(context, { node: call, path, scope: label });
    }
  }
}

function checkScope(context: Context, node: TSESTree.CallExpression, scope: RetryScope): void {
  const { retried } = scope;
  if (isCallback(retried)) {
    checkRetriedFunction(context, retried, scope.label);
    return;
  }
  const path =
    isReference(retried) || isBindCall(retried)
      ? referenceEffects(retried, context).get(UNSAFE)
      : undefined;
  if (path !== undefined) {
    report(context, { node, path, scope: scope.label });
  }
}

function checkRetryLoop(context: Context, node: TSESTree.CallExpression): void {
  const found = enclosingLoop(node, context);
  const retried =
    found?.loop !== undefined && isRetryAttempt(node, found.loop, context.sourceCode.visitorKeys);
  const path = retried ? callEffects(node, context).get(UNSAFE) : undefined;
  if (path !== undefined) {
    report(context, { node, path, scope: 'a retry loop' });
  }
}

export const rule: TSESLint.RuleModule<'retry', [], { readonly requiresTypeChecking: boolean }> = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Do not retry a write that has no idempotency contract',
      requiresTypeChecking: true,
    },
    schema: [],
    messages: {
      retry: [
        'This retries {{callee}} inside {{scope}}: when a timeout hits after the server accepted the',
        'write, the retry runs it twice. Give the write a stable idempotency key derived from the request',
        '(Stripe `{ idempotencyKey }`), a provider deduplication id (SQS or SNS FIFO `MessageDeduplicationId`,',
        'BullMQ `jobId`), an upsert (`ON CONFLICT`), or retry only the read.',
        'An exception fits only when running the write twice is harmless.',
      ].join(' '),
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        const scope = retryScope(node, context);
        if (scope === undefined) {
          checkRetryLoop(context, node);
        } else {
          checkScope(context, node, scope);
        }
      },
    };
  },
};
