import {} from '@typescript-eslint/utils';
import { listOf } from "../../../../../../../shared/values/readers.mjs";
import { suggestible } from "../../../fixes/support/descriptors.mjs";
import { HTTP_TIMEOUT_MS, httpTimeoutFix } from "../../../fixes/security/http-timeout-fix.mjs";
import { clientBindings, clientCall } from "./http-clients.mjs";
import { axiosPosition, defaultsTimeoutOwner, everyInstanceCallTimed, setsGlobalDispatcherTimeout, } from "./http-defaults.mjs";
const AXIOS = 'axios';
const FETCH = 'fetch';
const PROJECT_DEFAULTS = [AXIOS, FETCH];
function coveredByDefaults(found, defaults) {
    if (found.client === FETCH) {
        return defaults.fetch;
    }
    return (found.client === AXIOS &&
        (defaults.axios || defaults.owners.has(found.owner) || defaults.owners.has(found.instance)));
}
export const rule = {
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
            noTimeout: '{{call}} has no timeout, so a server that never answers hangs this code for good. Give it a deadline: `fetch(url, { signal: AbortSignal.timeout(10_000) })`, `axios.get(url, { timeout: 10_000 })` or `{ signal: AbortSignal.timeout(10_000) }`, `https.get(url, { timeout: 10_000 })`, `got(url, { timeout: { request: 10_000 } })`; or set it once for the client: `axios.create({ timeout: 10_000 })`, `axios.defaults.timeout = 10_000`, `got.extend({ timeout: { request: 10_000 } })`, undici `setGlobalDispatcher(new Agent({ headersTimeout: 10_000, bodyTimeout: 10_000 }))`. An exception fits only when this call is meant to wait without a limit.',
            addTimeout: 'Add a timeout of {{ms}} ms.',
        },
    },
    create(context) {
        const options = context.options[0] ?? {};
        const projectDefaults = listOf(options['projectDefaults']);
        const defaults = {
            axios: projectDefaults.includes(AXIOS),
            fetch: projectDefaults.includes(FETCH),
            owners: new Set(),
        };
        const pending = [];
        const scope = {
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
                    const timedInstance = found.call === 'axios.create()' && everyInstanceCallTimed(context, node);
                    if (!(coveredByDefaults(found, defaults) || timedInstance)) {
                        const plan = httpTimeoutFix(context.sourceCode, node, { found, axiosPosition });
                        context.report(suggestible({ node, messageId: 'noTimeout', data: { call: found.call } }, { messageId: 'addTimeout', plan, data: { ms: String(HTTP_TIMEOUT_MS) } }));
                    }
                }
            },
        };
    },
};
