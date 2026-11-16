import { isFixedCollection } from '../collections/fixed-collections.mts';
import { createIo } from '../fan-out-io.mts';
import { contains } from '../../analysis/ancestry.mjs';
import { skipped } from '../io-origin.mts';
import { callsOf, workerOf } from '../sites.mts';
import { lazyScope, remoteIn } from '../unbounded-fan-out.mts';
import { isUnlimited, pipeSource, rxjsName } from './rxjs-calls.mts';
import { callEffects, describePath, ioEffect } from '../../support/io-effects.mts';

const OPERATORS = new Set(['mergeMap', 'flatMap', 'concatMap', 'switchMap', 'exhaustMap']);
const UNLIMITED_OPERATORS = new Set(['mergeMap', 'flatMap']);
const MAX_HELPER_DEPTH = 2;
const MAX_TEXT = 50;

function parameterReferences(context, fn) {
  const variables = fn === undefined ? [] : context.sourceCode.getDeclaredVariables(fn);
  return variables.flatMap((variable) => variable.references.map(({ identifier }) => identifier));
}

function readsElement(call, references) {
  return references.some((identifier) => contains(call, identifier));
}

function isLiteralSet(node) {
  const target = skipped(node);
  const [items] = target?.type === 'NewExpression' ? target.arguments : [];
  return (
    target?.type === 'NewExpression' &&
    target.callee.name === 'Set' &&
    items?.type === 'ArrayExpression' &&
    items.elements.every((item) => item !== null && item.type !== 'SpreadElement')
  );
}

function directLookup(context, calls) {
  return calls
    .filter((call) => !callEffects(call, context).has('write'))
    .map((call) => ioEffect(call, context))
    .find((effect) => effect !== undefined && effect.kind !== 'message' && !effect.cache);
}

function lookupIn(context, io, body) {
  const pending = [{ calls: body, depth: 0 }];
  for (const { calls, depth } of pending) {
    const effect = directLookup(context, calls);
    if (effect !== undefined) {
      return effect;
    }
    const helpers = depth < MAX_HELPER_DEPTH ? calls.map((call) => io.helperOf(call)) : [];
    for (const helper of helpers.filter((each) => each !== undefined)) {
      pending.push({ calls: callsOf({ fn: helper, root: helper }), depth: depth + 1 });
    }
  }
  return undefined;
}

function perElementLookup(context, io, worker) {
  const references = parameterReferences(context, worker.fn);
  const calls = callsOf(worker).filter(
    (call) => worker.fn === undefined || readsElement(call, references),
  );
  return lookupIn(context, io, calls);
}

function isCovered(scope, { name, limited, worker, effect }) {
  return (
    UNLIMITED_OPERATORS.has(name) &&
    !limited &&
    effect.kind === 'remote' &&
    remoteIn(scope, worker) !== undefined
  );
}

export const rule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Do not look up a database row or remote resource once per element of an RxJS pipeline',
      requiresTypeChecking: true,
    },
    schema: [],
    messages: {
      lookup: [
        '`{{operator}}` runs {{callee}} once for every element of `{{collection}}`: N elements make N queries or requests,',
        'with or without a concurrency limit. Fetch them in one batched query (`findByIds`, `WHERE id IN (...)`, a batch',
        'endpoint) before the pipeline and join the rows to the elements in memory.',
        'An exception fits only when the collection is always tiny.',
      ].join(' '),
    },
  },
  create(context) {
    if (!context.sourceCode.text.includes('rxjs')) {
      return {};
    }
    const scope = lazyScope(context);
    const io = createIo(context);
    return {
      CallExpression(node) {
        const name = rxjsName(context, node.callee);
        const [project, ...rest] = node.arguments;
        const worker = OPERATORS.has(name) ? workerOf(context, project) : undefined;
        const collection = worker === undefined ? undefined : pipeSource(context, node);
        const effect = collection === undefined ? undefined : perElementLookup(context, io, worker);
        const limited = rest.some((argument) => !isUnlimited(context, argument));
        if (
          effect === undefined ||
          isFixedCollection(context, collection) ||
          isLiteralSet(collection) ||
          isCovered(scope, { name, limited, worker, effect })
        ) {
          return;
        }
        const text = context.sourceCode.getText(skipped(collection));
        context.report({
          node,
          messageId: 'lookup',
          data: {
            operator: name,
            callee: describePath(effect.path),
            collection: text.length <= MAX_TEXT ? text : 'the collection',
          },
        });
      },
    };
  },
};
