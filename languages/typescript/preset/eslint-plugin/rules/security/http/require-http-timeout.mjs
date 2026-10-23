import { clientBindings, clientCall } from './http-clients.mjs';
import {
  defaultsTimeoutOwner,
  everyInstanceCallTimed,
  setsGlobalDispatcherTimeout,
} from './http-defaults.mjs';

const PROJECT_DEFAULTS = ['axios', 'fetch'];

function coveredByDefaults(found, defaults) {
  if (found.client === 'fetch') {
    return defaults.fetch;
  }
  return (
    found.client === 'axios' &&
    (defaults.axios || defaults.owners.has(found.owner) || defaults.owners.has(found.instance))
  );
}

export const rule = {
  meta: {
    type: 'problem',
    docs: { description: 'Require a timeout on outbound HTTP calls' },
    schema: [
      {
        type: 'object',
        properties: {
          fetch: { type: 'boolean' },
          nodeFetchTimeout: { type: 'boolean' },
          projectDefaults: { type: 'array', items: { enum: PROJECT_DEFAULTS } },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      noTimeout:
        '{{call}} has no timeout, so a server that never answers hangs this code for good. Give it a deadline: `fetch(url, { signal: AbortSignal.timeout(10_000) })`, `axios.get(url, { timeout: 10_000 })` or `{ signal: AbortSignal.timeout(10_000) }`, `https.get(url, { timeout: 10_000 })`, `got(url, { timeout: { request: 10_000 } })`; or set it once for the client: `axios.create({ timeout: 10_000 })`, `axios.defaults.timeout = 10_000`, `got.extend({ timeout: { request: 10_000 } })`, undici `setGlobalDispatcher(new Agent({ headersTimeout: 10_000, bodyTimeout: 10_000 }))`. An exception fits only when this call is meant to wait without a limit.',
    },
  },
  create(context) {
    const options = context.options[0] ?? {};
    const projectDefaults = options.projectDefaults ?? [];
    const defaults = {
      axios: projectDefaults.includes('axios'),
      fetch: projectDefaults.includes('fetch'),
      owners: new Set(),
    };
    const pending = [];
    let scope;

    return {
      Program(node) {
        scope = {
          context,
          checkFetch: options.fetch !== false,
          nodeFetchTimeout: options.nodeFetchTimeout !== false,
          ...clientBindings(node),
        };
      },
      AssignmentExpression(node) {
        const owner = defaultsTimeoutOwner(context, node);
        if (owner !== undefined) {
          defaults.owners.add(owner);
        }
      },
      CallExpression(node) {
        defaults.fetch ||= setsGlobalDispatcherTimeout(context, node, scope.undici);
        const found = clientCall(scope, node);
        if (found !== undefined) {
          pending.push({ node, found });
        }
      },
      'Program:exit'() {
        for (const { node, found } of pending) {
          const timedInstance =
            found.call === 'axios.create()' && everyInstanceCallTimed(context, node);
          if (!coveredByDefaults(found, defaults) && !timedInstance) {
            context.report({ node, messageId: 'noTimeout', data: { call: found.call } });
          }
        }
      },
    };
  },
};
