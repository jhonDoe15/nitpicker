import { memberName, unwrapped } from './security-values.mjs';
import { clientBindings, clientCall } from './http-clients.mjs';

function isAxiosDefaultsTimeout(assignment) {
  const target = unwrapped(assignment.left);
  if (target.type !== 'MemberExpression') {
    return false;
  }
  const owner = unwrapped(target.object);
  return (
    memberName(target) === 'timeout' &&
    owner.type === 'MemberExpression' &&
    memberName(owner) === 'defaults'
  );
}

export const rule = {
  meta: {
    type: 'problem',
    docs: { description: 'Require a timeout on outbound HTTP calls' },
    schema: [
      {
        type: 'object',
        properties: { fetch: { type: 'boolean' } },
        additionalProperties: false,
      },
    ],
    messages: {
      noTimeout:
        '{{call}} has no timeout, so a server that never answers hangs this code for good. Give it a deadline: `fetch(url, { signal: AbortSignal.timeout(10_000) })`, `axios.get(url, { timeout: 10_000 })` or `axios.create({ timeout: 10_000 })`, `https.get(url, { timeout: 10_000 })`, `got(url, { timeout: { request: 10_000 } })`. If this call is meant to wait without a limit, add an exception for this rule in nitpicker.config.json.',
    },
  },
  create(context) {
    const checkFetch = context.options[0]?.fetch !== false;
    const pending = [];
    let scope;
    let axiosDefaultsTimeout = false;

    return {
      Program(node) {
        scope = { context, checkFetch, ...clientBindings(node) };
      },
      AssignmentExpression(node) {
        axiosDefaultsTimeout ||= isAxiosDefaultsTimeout(node);
      },
      CallExpression(node) {
        const call = clientCall(scope, node);
        if (call !== undefined) {
          pending.push({ node, call });
        }
      },
      'Program:exit'() {
        for (const { node, call } of pending) {
          if (!(axiosDefaultsTimeout && call.startsWith('axios'))) {
            context.report({ node, messageId: 'noTimeout', data: { call } });
          }
        }
      },
    };
  },
};
