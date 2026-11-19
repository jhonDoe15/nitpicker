import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import {
  CONCURRENCY_LIMIT,
  concurrencyLimitFix,
} from '../../../fixes/reactive/concurrency-limit-fix.mts';
import type { Context } from '../../security/security-values.mts';
import { skipped } from '../io-origin.mts';
import { mappings, workerOf, type Site } from '../sites.mts';
import { lazyScope, reportSites, type FanOutScope } from '../unbounded-fan-out.mts';
import { isLimitArgument } from './merge-limit.mts';
import { isSelector, isUnlimited, pipeSource, rxjsName } from './rxjs-calls.mts';

type Group = {
  readonly form: 'operator' | 'merge' | 'forkJoin';
  readonly operator: string;
  readonly sites: readonly Site[];
};

const OPERATORS = new Set(['mergeMap', 'flatMap']);
const EXCEPTION = 'An exception fits only when the collection is always small.';
const CONSEQUENCE =
  "at once, so a large collection exhausts the {{target}}'s connections or rate limit.";

function mappedBefore(
  context: Context,
  call: TSESTree.CallExpression,
  collection: TSESTree.Node,
): Site[] {
  const pipe = call.parent;
  if (pipe.type !== AST_NODE_TYPES.CallExpression) {
    return [];
  }
  const operators = pipe.arguments;
  const previous = operators[operators.indexOf(call) - 1];
  const isMap =
    previous?.type === AST_NODE_TYPES.CallExpression &&
    rxjsName(context, previous.callee) === 'map';
  const worker = isMap ? workerOf(context, previous.arguments[0]) : undefined;
  return worker === undefined ? [] : [{ collection, worker }];
}

function hasNoLimit(context: Context, call: TSESTree.CallExpression): boolean {
  const [limit] = call.arguments;
  return (
    limit === undefined ||
    (call.arguments.length === 1 && isUnlimited(context, limit) && !isSelector(context, limit))
  );
}

function operatorSites(context: Context, call: TSESTree.CallExpression, name: string): Site[] {
  if (name === 'mergeAll') {
    const source = hasNoLimit(context, call) ? pipeSource(context, call) : undefined;
    return source === undefined
      ? []
      : [...mappings(context, source), ...mappedBefore(context, call, source)];
  }
  const [project, ...rest] = call.arguments;
  const limit = rest.find((argument) => !isUnlimited(context, argument));
  const worker = limit === undefined ? workerOf(context, project) : undefined;
  const collection = worker === undefined ? undefined : pipeSource(context, call);
  return worker === undefined || collection === undefined ? [] : [{ collection, worker }];
}

function lastLimits(
  context: Context,
  name: string,
  args: TSESTree.CallExpression['arguments'],
): boolean {
  const last = args.at(-1);
  return (
    name === 'merge' &&
    args.length > 1 &&
    last !== undefined &&
    last.type !== AST_NODE_TYPES.SpreadElement &&
    isLimitArgument(context, last)
  );
}

function combinatorSites(context: Context, call: TSESTree.CallExpression, name: string): Site[] {
  if (lastLimits(context, name, call.arguments)) {
    return [];
  }
  return call.arguments.flatMap((argument) =>
    mappings(
      context,
      argument.type === AST_NODE_TYPES.SpreadElement ? argument.argument : argument,
    ),
  );
}

function sitesOf(context: Context, call: TSESTree.CallExpression): Group | undefined {
  const name = rxjsName(context, call.callee) ?? '';
  if (OPERATORS.has(name) || name === 'mergeAll') {
    return { form: 'operator', operator: name, sites: operatorSites(context, call, name) };
  }
  return name === 'forkJoin' || name === 'merge'
    ? { form: name, operator: name, sites: combinatorSites(context, call, name) }
    : undefined;
}

function report(
  scope: FanOutScope,
  group: Group & { readonly node: TSESTree.CallExpression },
): void {
  const { context } = scope;
  const plan = concurrencyLimitFix(context.sourceCode, group.node, {
    operator: group.operator,
    isUnlimited: (argument) => isUnlimited(context, argument),
    isSelector: (argument) => isSelector(context, argument),
  });
  const at = {
    node: group.node,
    messageId: group.form,
    data: { operator: group.operator },
    sites: group.sites,
    fix: { messageId: 'limit', data: { limit: String(CONCURRENCY_LIMIT) }, plan },
  };
  reportSites(scope, at, (collection) => context.sourceCode.getText(skipped(collection)));
}

export const rule: TSESLint.RuleModule<'operator' | 'merge' | 'forkJoin' | 'limit'> = {
  meta: {
    type: 'problem',
    hasSuggestions: true,
    docs: { description: 'Bound the concurrency of remote calls that RxJS subscribes per element' },
    schema: [],
    messages: {
      limit: 'Add a concurrency limit of {{limit}}.',
      operator: [
        '`{{operator}}` without a concurrency argument subscribes to {{operation}}{{via}} for every element of',
        `\`{{collection}}\` ${CONSEQUENCE} Pass a concurrency limit (\`mergeMap((item) => load(item), 8)\`),`,
        `use \`concatMap\` for one call at a time, or \`bufferCount(20)\` and make one batch call per chunk. ${EXCEPTION}`,
      ].join(' '),
      merge: [
        '`merge` subscribes to {{operation}}{{via}} for every element of',
        `\`{{collection}}\` ${CONSEQUENCE} Pass a concurrency limit as the last argument`,
        `(\`merge(...items.map((item) => load(item)), 8)\`), or make one batch call when the API has one. ${EXCEPTION}`,
      ].join(' '),
      forkJoin: [
        '`forkJoin` subscribes to {{operation}}{{via}} for every element of',
        `\`{{collection}}\` ${CONSEQUENCE} Bound it with`,
        '`from(items).pipe(mergeMap((item, index) => load(item).pipe(last(), map((value) => [index, value])), 8), toArray())`',
        'and sort the pairs by index to keep the input order. That form differs from `forkJoin`: an empty collection emits',
        '`[]` where `forkJoin([])` completes without a value, and a source that emits nothing errors in `last()` where',
        `\`forkJoin\` completes without a value. Or make one batch call when the API has one. ${EXCEPTION}`,
      ].join(' '),
    },
  },
  create(context) {
    if (!context.sourceCode.text.includes('rxjs')) {
      return {};
    }
    const scope = lazyScope(context);
    return {
      CallExpression(node) {
        const group = sitesOf(context, node);
        if (group !== undefined && group.sites.length > 0) {
          report(scope, { ...group, node });
        }
      },
    };
  },
};
