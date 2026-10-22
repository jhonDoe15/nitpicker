import { callsWithin } from '../effects/held-scopes.mjs';
import { enclosingLoop, isRetryAttempt } from '../loops/loop-shapes.mjs';
import { callEffects, describePath, referenceEffects } from '../support/io-effects.mjs';
import { retryScope } from './retry-scopes.mjs';

const UNSAFE = 'unsafe';
const FUNCTIONS = new Set(['ArrowFunctionExpression', 'FunctionExpression']);
const REFERENCES = new Set(['Identifier', 'MemberExpression']);

function report(context, { node, path, scope }) {
  context.report({ node, messageId: 'retry', data: { callee: describePath(path), scope } });
}

function checkRetriedFunction(context, { retried, label }) {
  for (const call of callsWithin(retried.body, context.sourceCode.visitorKeys)) {
    const path = callEffects(call, context).get(UNSAFE);
    if (path !== undefined) {
      report(context, { node: call, path, scope: label });
    }
  }
}

function checkScope(context, node, scope) {
  const { retried } = scope;
  if (FUNCTIONS.has(retried?.type)) {
    checkRetriedFunction(context, scope);
    return;
  }
  const path = REFERENCES.has(retried?.type)
    ? referenceEffects(retried, context).get(UNSAFE)
    : undefined;
  if (path !== undefined) {
    report(context, { node, path, scope: scope.label });
  }
}

function checkRetryLoop(context, node) {
  const found = enclosingLoop(node, context.sourceCode);
  const retried =
    found?.loop !== undefined && isRetryAttempt(node, found.loop, context.sourceCode.visitorKeys);
  const path = retried ? callEffects(node, context).get(UNSAFE) : undefined;
  if (path !== undefined) {
    report(context, { node, path, scope: 'a retry loop' });
  }
}

export const rule = {
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
        const scope = retryScope(node, context.sourceCode);
        if (scope === undefined) {
          checkRetryLoop(context, node);
        } else {
          checkScope(context, node, scope);
        }
      },
    };
  },
};
