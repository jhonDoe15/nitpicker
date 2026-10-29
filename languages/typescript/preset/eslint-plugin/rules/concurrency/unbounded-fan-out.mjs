import { createBounds } from './bounds.mjs';
import { isFixedCollection } from './collections/fixed-collections.mjs';
import { createIo } from './fan-out-io.mjs';
import { combinatorName, callsOf, mappings, workerOf } from './sites.mjs';

const MAX_HELPER_DEPTH = 3;
const MAX_TEXT = 50;
const TARGETS = { remote: 'remote service', message: 'broker' };

function labelOf(context, call) {
  const text = context.sourceCode.getText(call.callee);
  return text.length <= MAX_TEXT ? `${text}()` : 'a call';
}

function foundAt(scope, entry, hit) {
  const operation = labelOf(scope.context, hit.call);
  if (entry.depth === 0) {
    return { kind: hit.kind, operation };
  }
  return { kind: hit.kind, operation: labelOf(scope.context, entry.origin), via: operation };
}

function inspect(scope, entry) {
  const { fn, root } = entry.worker;
  const helpers = [];
  if (fn !== undefined && scope.bounds.acquiresIn(fn)) {
    return { helpers };
  }
  for (const call of callsOf(entry.worker)) {
    if (scope.bounds.wrapsInFunction(call, root)) {
      continue;
    }
    const kind = scope.io.ioKind(call);
    if (kind !== undefined) {
      return { found: foundAt(scope, entry, { call, kind }), helpers };
    }
    const helper = entry.depth < MAX_HELPER_DEPTH ? scope.io.helperOf(call) : undefined;
    if (helper !== undefined) {
      helpers.push({ call, helper });
    }
  }
  return { helpers };
}

function remoteIn(scope, worker) {
  const seen = new Set();
  const pending = [{ worker, depth: 0, origin: worker.root }];
  for (const entry of pending) {
    const { found, helpers } = inspect(scope, entry);
    if (found !== undefined) {
      return found;
    }
    for (const { call, helper } of helpers.filter((item) => !seen.has(item.helper))) {
      seen.add(helper);
      pending.push({
        worker: { root: helper, fn: helper },
        depth: entry.depth + 1,
        origin: entry.depth === 0 ? call : entry.origin,
      });
    }
  }
  return undefined;
}

function viaText(found) {
  if (found.via === undefined) {
    return '';
  }
  const verb = found.kind === 'message' ? 'publishes through' : 'calls';
  return ` (which ${verb} \`${found.via}\`)`;
}

function reportSites(scope, group) {
  const { context } = scope;
  const { node, combinator, sites } = group;
  const reported = new Set();
  for (const { collection, worker } of sites) {
    const found = remoteIn(scope, worker);
    const text = context.sourceCode.getText(collection);
    const key = `${found?.operation}|${text}`;
    if (found === undefined || reported.has(key) || isFixedCollection(context, collection)) {
      continue;
    }
    reported.add(key);
    context.report({
      node,
      messageId: 'unbounded',
      data: {
        combinator,
        operation: found.operation,
        via: viaText(found),
        collection: text.length <= MAX_TEXT ? text : 'the collection',
        target: TARGETS[found.kind],
      },
    });
  }
}

function mentionsPMap(context) {
  return context.sourceCode.text.includes('p-map');
}

function lazyScope(context) {
  let bounds;
  let io;
  return {
    context,
    get bounds() {
      bounds ??= createBounds(context);
      return bounds;
    },
    get io() {
      io ??= createIo(context);
      return io;
    },
  };
}

export const rule = {
  meta: {
    type: 'problem',
    docs: { description: 'Bound the concurrency of remote calls started per element' },
    schema: [],
    messages: {
      unbounded:
        "{{combinator}} starts {{operation}}{{via}} for every element of `{{collection}}` at once, so a large collection exhausts the {{target}}'s connections or rate limit. Run each call through a limiter created once outside the loop (`const limit = pLimit(8)`, then `limit(() => send(item))`), await fixed-size chunks, or make one batch call when the API has one. An exception fits only when the collection is always small.",
    },
  },
  create(context) {
    const scope = lazyScope(context);
    return {
      CallExpression(node) {
        const combinator = combinatorName(context, node);
        if (combinator !== undefined) {
          reportSites(scope, {
            node,
            combinator,
            sites: mappings(context, node.arguments[0] ?? node),
          });
        } else if (mentionsPMap(context) && scope.bounds.isUnboundedPMap(node)) {
          const worker = workerOf(context, node.arguments[1]);
          const sites = worker === undefined ? [] : [{ collection: node.arguments[0], worker }];
          reportSites(scope, { node, combinator: 'pMap', sites });
        }
      },
    };
  },
};
