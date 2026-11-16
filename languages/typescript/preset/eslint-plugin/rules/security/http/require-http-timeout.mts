import { type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { listOf } from '../../../../../../../shared/values/readers.mts';
import { suggestible } from '../../../fixes/support/descriptors.mts';
import { HTTP_TIMEOUT_MS, httpTimeoutFix } from '../../../fixes/security/http-timeout-fix.mts';
import { clientBindings, clientCall, type ClientScope, type Found } from './http-clients.mts';
import {
  axiosPosition,
  defaultsTimeoutOwner,
  everyInstanceCallTimed,
  setsGlobalDispatcherTimeout,
} from './http-defaults.mts';

type MessageIds = 'noTimeout' | 'addTimeout';
type Options = readonly [Readonly<Record<string, unknown>>?];
type Defaults = {
  readonly axios: boolean;
  fetch: boolean;
  readonly owners: Set<string | undefined>;
};

const AXIOS = 'axios';
const FETCH = 'fetch';
const PROJECT_DEFAULTS = [AXIOS, FETCH];

function coveredByDefaults(found: Found, defaults: Defaults): boolean {
  if (found.client === FETCH) {
    return defaults.fetch;
  }
  return (
    found.client === AXIOS &&
    (defaults.axios || defaults.owners.has(found.owner) || defaults.owners.has(found.instance))
  );
}

export const rule: TSESLint.RuleModule<MessageIds, Options> = {
  meta: {
    type: 'problem',
    hasSuggestions: true,
    docs: { description: 'Require a timeout on outbound HTTP calls' },
    schema: [
      {
        type: 'object',
        properties: {
          fetch: { type: 'boolean' },
          nodeFetchTimeout: { type: 'boolean' },
          projectDefaults: { type: 'array', items: { type: 'string', enum: PROJECT_DEFAULTS } },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      noTimeout:
        '{{call}} has no timeout, so a server that never answers hangs this code for good. Give it a deadline: `fetch(url, { signal: AbortSignal.timeout(10_000) })`, `axios.get(url, { timeout: 10_000 })` or `{ signal: AbortSignal.timeout(10_000) }`, `https.get(url, { timeout: 10_000 })`, `got(url, { timeout: { request: 10_000 } })`; or set it once for the client: `axios.create({ timeout: 10_000 })`, `axios.defaults.timeout = 10_000`, `got.extend({ timeout: { request: 10_000 } })`, undici `setGlobalDispatcher(new Agent({ headersTimeout: 10_000, bodyTimeout: 10_000 }))`. An exception fits only when this call is meant to wait without a limit.',
      addTimeout: 'Add a timeout of {{ms}} ms.',
    },
  },
  create(context) {
    const options = context.options[0] ?? {};
    const projectDefaults = listOf(options['projectDefaults']);
    const defaults: Defaults = {
      axios: projectDefaults.includes(AXIOS),
      fetch: projectDefaults.includes(FETCH),
      owners: new Set<string | undefined>(),
    };
    const pending: { node: TSESTree.CallExpression; found: Found }[] = [];
    const scope: ClientScope = {
      context,
      checkFetch: options[FETCH] !== false,
      nodeFetchTimeout: options['nodeFetchTimeout'] !== false,
      ...clientBindings(context.sourceCode.ast),
    };

    return {
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
          if (!(coveredByDefaults(found, defaults) || timedInstance)) {
            const plan = httpTimeoutFix(context.sourceCode, node, { found, axiosPosition });
            context.report(
              suggestible(
                { node, messageId: 'noTimeout', data: { call: found.call } },
                { messageId: 'addTimeout', plan, data: { ms: String(HTTP_TIMEOUT_MS) } },
              ),
            );
          }
        }
      },
    };
  },
};
