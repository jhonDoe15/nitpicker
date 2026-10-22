import { isFixedCollection, createBounds } from './bounds.mjs';
import { helperOf, ioKind } from './fan-out-io.mjs';
import { combinatorName, callsOf, mappings, workerOf } from './sites.mjs';

const MAX_HELPER_DEPTH = 3;
const MAX_TEXT = 50;
const TARGETS = { remote: 'remote service', message: 'broker' };

function labelOf(context, call) {
  const text = context.sourceCode.getText(call.callee);
  return text.length <= MAX_TEXT ? `${text}()` : 'a call';
}

function remoteIn(scope, worker, depth = 0) {
  const { context, bounds, seen } = scope;
  if (worker.fn !== undefined && bounds.acquiresIn(worker.fn)) {
    return undefined;
  }
  for (const call of callsOf(worker)) {
    if (bounds.wrapsInFunction(call, worker.root)) {
      continue;
    }
    const kind = ioKind(call, context);
    if (kind !== undefined) {
      return { kind, operation: labelOf(context, call) };
    }
    const helper = depth < MAX_HELPER_DEPTH ? helperOf(call, context) : undefined;
    if (helper === undefined || seen.has(helper)) {
      continue;
    }
    seen.add(helper);
    const found = remoteIn(scope, { root: helper, fn: helper }, depth + 1);
    if (found !== undefined) {
      return {
        kind: found.kind,
        operation: labelOf(context, call),
        via: found.via ?? found.operation,
      };
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

function reportSites(scope, node, combinator, sites) {
  const { context } = scope;
  const reported = new Set();
  for (const { collection, worker } of sites) {
    scope.seen = new Set();
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
  return {
    context,
    seen: new Set(),
    get bounds() {
      bounds ??= createBounds(context);
      return bounds;
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
        '{{combinator}} starts {{operation}}{{via}} for every element of `{{collection}}` at once, with no bound on how many run together, so a large collection exhausts connections, rate limits or the {{target}}. Bound it: run each call through a limiter created outside the loop (`const limit = pLimit(8); await Promise.all(items.map((item) => limit(() => send(item))))`, or p-queue with `concurrency`, Bottleneck with `maxConcurrent`), or work through fixed-size chunks (`for (const chunk of chunks(items, 20)) { await Promise.all(chunk.map(send)); }`), or send one batch request when the API has one. A concurrency constant that no limiter uses bounds nothing. An exception fits only when the collection is always small.',
    },
  },
  create(context) {
    const scope = lazyScope(context);
    return {
      CallExpression(node) {
        const combinator = combinatorName(node);
        if (combinator !== undefined) {
          reportSites(scope, node, combinator, mappings(context, node.arguments[0] ?? node));
        } else if (mentionsPMap(context) && scope.bounds.isUnboundedPMap(node)) {
          const worker = workerOf(context, node.arguments[1]);
          const sites = worker === undefined ? [] : [{ collection: node.arguments[0], worker }];
          reportSites(scope, node, 'pMap', sites);
        }
      },
    };
  },
};
