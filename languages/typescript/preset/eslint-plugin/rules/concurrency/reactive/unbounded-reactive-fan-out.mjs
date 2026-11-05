import { isFixedCollection } from '../collections/fixed-collections.mjs';
import { skipped } from '../io-origin.mjs';
import { mappings, workerOf } from '../sites.mjs';
import { TARGETS, lazyScope, remoteIn, viaText } from '../unbounded-fan-out.mjs';
import { isUnlimited, pipeSource, rxjsName } from './rxjs-calls.mjs';

const MAX_TEXT = 50;
const OPERATORS = new Set(['mergeMap', 'flatMap']);
const COMBINATORS = new Set(['forkJoin', 'combineLatest', 'zip', 'merge']);
const EXCEPTION = 'An exception fits only when the collection is always small.';
const CONSEQUENCE =
  "at once, so a large collection exhausts the {{target}}'s connections or rate limit.";

function mappedBefore(context, call, collection) {
  const operators = call.parent.arguments;
  const previous = operators[operators.indexOf(call) - 1];
  const isMap = previous?.type === 'CallExpression' && rxjsName(context, previous.callee) === 'map';
  const worker = isMap ? workerOf(context, previous.arguments[0]) : undefined;
  return worker === undefined ? [] : [{ collection, worker }];
}

function operatorSites(context, call, name) {
  if (name === 'mergeAll') {
    const source = call.arguments.length === 0 ? pipeSource(context, call) : undefined;
    return source === undefined
      ? []
      : [...mappings(context, source), ...mappedBefore(context, call, source)];
  }
  const [project, ...rest] = call.arguments;
  const limit = rest.find((argument) => !isUnlimited(context, argument));
  const worker = limit === undefined ? workerOf(context, project) : undefined;
  const collection = worker === undefined ? undefined : pipeSource(context, call);
  return collection === undefined ? [] : [{ collection, worker }];
}

function lastLimits(context, name, args) {
  const last = args.at(-1);
  return (
    name === 'merge' &&
    args.length > 1 &&
    last.type !== 'SpreadElement' &&
    !isUnlimited(context, last)
  );
}

function combinatorSites(context, call, name) {
  if (lastLimits(context, name, call.arguments)) {
    return [];
  }
  return call.arguments.flatMap((argument) =>
    mappings(context, argument.type === 'SpreadElement' ? argument.argument : argument),
  );
}

function sitesOf(context, call) {
  const name = rxjsName(context, call.callee);
  if (OPERATORS.has(name) || name === 'mergeAll') {
    return { form: 'operator', operator: name, sites: operatorSites(context, call, name) };
  }
  return COMBINATORS.has(name)
    ? { form: 'combinator', operator: name, sites: combinatorSites(context, call, name) }
    : undefined;
}

function report(scope, group) {
  const { context } = scope;
  const reported = new Set();
  for (const { collection, worker } of group.sites) {
    const found = remoteIn(scope, worker);
    const text = context.sourceCode.getText(skipped(collection));
    const key = `${found?.operation}|${text}`;
    if (found === undefined || reported.has(key) || isFixedCollection(context, collection)) {
      continue;
    }
    reported.add(key);
    context.report({
      node: group.node,
      messageId: group.form,
      data: {
        operator: group.operator,
        operation: found.operation,
        via: viaText(found),
        collection: text.length <= MAX_TEXT ? text : 'the collection',
        target: TARGETS[found.kind],
      },
    });
  }
}

export const rule = {
  meta: {
    type: 'problem',
    docs: { description: 'Bound the concurrency of remote calls that RxJS subscribes per element' },
    schema: [],
    messages: {
      operator: [
        '`{{operator}}` without a concurrency argument subscribes to {{operation}}{{via}} for every element of',
        `\`{{collection}}\` ${CONSEQUENCE} Pass a concurrency limit (\`mergeMap((item) => load(item), 8)\`),`,
        `use \`concatMap\` for one call at a time, or \`bufferCount(20)\` and make one batch call per chunk. ${EXCEPTION}`,
      ].join(' '),
      combinator: [
        '`{{operator}}` subscribes to {{operation}}{{via}} for every element of',
        `\`{{collection}}\` ${CONSEQUENCE} Build the result with`,
        '`from(items).pipe(mergeMap((item) => load(item), 8), toArray())`, or make one batch call when',
        `the API has one. ${EXCEPTION}`,
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
