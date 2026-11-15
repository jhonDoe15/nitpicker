import type { TSESLint, TSESTree } from '@typescript-eslint/utils';
import type { Context } from '../security/security-values.mts';
import { createBounds, type Bounds } from './bounds.mts';
import { isFixedCollection } from './collections/fixed-collections.mts';
import { createIo, type Io } from './fan-out-io.mts';
import type { ClientSpec } from './io-origin.mts';
import type { Invocation } from './origins/origin-types.mts';
import { combinatorName, callsOf, mappings, workerOf, type Site, type Worker } from './sites.mts';

type FunctionNode =
  TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression | TSESTree.FunctionDeclaration;
type Found = {
  readonly kind: ClientSpec['kind'];
  readonly operation: string;
  readonly via?: string;
};
export type FanOutScope = {
  readonly context: Context;
  readonly bounds: Bounds;
  readonly io: Io;
};
type Entry = {
  readonly worker: Worker;
  readonly depth: number;
  readonly origin: Invocation | undefined;
};
type HelperCall = { readonly call: Invocation; readonly helper: FunctionNode };
type Group = {
  readonly node: TSESTree.CallExpression;
  readonly combinator: string;
  readonly sites: readonly Site[];
};

const MAX_HELPER_DEPTH = 3;
const MAX_TEXT = 50;
const TARGETS: Readonly<Record<string, string>> = {
  remote: 'remote service',
  message: 'broker',
};

function labelOf(context: Context, call: Invocation): string {
  const text = context.sourceCode.getText(call.callee);
  return text.length <= MAX_TEXT ? `${text}()` : 'a call';
}

function foundAt(
  scope: FanOutScope,
  entry: Entry,
  hit: { readonly call: Invocation; readonly kind: ClientSpec['kind'] },
): Found {
  const operation = labelOf(scope.context, hit.call);
  if (entry.depth === 0 || entry.origin === undefined) {
    return { kind: hit.kind, operation };
  }
  return { kind: hit.kind, operation: labelOf(scope.context, entry.origin), via: operation };
}

function inspect(
  scope: FanOutScope,
  entry: Entry,
): { readonly found?: Found; readonly helpers: HelperCall[] } {
  const { fn, root } = entry.worker;
  const helpers: HelperCall[] = [];
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

function remoteIn(scope: FanOutScope, worker: Worker): Found | undefined {
  const seen = new Set<FunctionNode>();
  const pending: Entry[] = [{ worker, depth: 0, origin: undefined }];
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

function viaText(found: Found): string {
  if (found.via === undefined) {
    return '';
  }
  const verb = found.kind === 'message' ? 'publishes through' : 'calls';
  return ` (which ${verb} \`${found.via}\`)`;
}

export function reportSites(
  scope: FanOutScope,
  at: {
    readonly node: TSESTree.Node;
    readonly messageId: string;
    readonly data: Readonly<Record<string, string>>;
  },
  sites: readonly Site[],
  textOf: (collection: TSESTree.Node) => string,
): void {
  const { context } = scope;
  const reported = new Set();
  for (const { collection, worker } of sites) {
    const found = remoteIn(scope, worker);
    const text = textOf(collection);
    const key = `${String(found?.operation)}|${text}`;
    if (found === undefined || reported.has(key) || isFixedCollection(context, collection)) {
      continue;
    }
    reported.add(key);
    context.report({
      node: at.node,
      messageId: at.messageId,
      data: {
        ...at.data,
        operation: found.operation,
        via: viaText(found),
        collection: text.length <= MAX_TEXT ? text : 'the collection',
        target: TARGETS[found.kind],
      },
    });
  }
}

function reportGroup(scope: FanOutScope, group: Group): void {
  const { context } = scope;
  const { node, combinator, sites } = group;
  const at = { node, messageId: 'unbounded', data: { combinator } };
  reportSites(scope, at, sites, (collection) => context.sourceCode.getText(collection));
}

function mentionsPMap(context: Context): boolean {
  return context.sourceCode.text.includes('p-map');
}

export function lazyScope(context: Context): FanOutScope {
  let bounds: Bounds | undefined;
  let io: Io | undefined;
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

export const rule: TSESLint.RuleModule<'unbounded'> = {
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
          reportGroup(scope, {
            node,
            combinator,
            sites: mappings(context, node.arguments[0] ?? node),
          });
        } else if (mentionsPMap(context) && scope.bounds.isUnboundedPMap(node)) {
          const worker = workerOf(context, node.arguments[1]);
          const [collection] = node.arguments;
          const sites =
            worker === undefined || collection === undefined ? [] : [{ collection, worker }];
          reportGroup(scope, { node, combinator: 'pMap', sites });
        }
      },
    };
  },
};
