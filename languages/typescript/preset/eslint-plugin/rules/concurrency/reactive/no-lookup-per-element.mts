import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import type { Context } from '../../security/security-values.mts';
import { contains } from '../../typed/node-views.mts';
import { isFixedCollection } from '../collections/fixed-collections.mts';
import { createIo, type Io } from '../fan-out-io.mts';
import { skipped } from '../io-origin.mts';
import type { Invocation } from '../origins/origin-types.mts';
import { callsOf, workerOf, type Worker } from '../sites.mts';
import { lazyScope, remoteIn, type FanOutScope } from '../unbounded-fan-out.mts';
import { isUnlimited, pipeSource, rxjsName } from './rxjs-calls.mts';
import { callEffects, describePath, ioEffect } from '../../support/io-effects.mts';

type Lookup = NonNullable<ReturnType<typeof ioEffect>>;
type Frame = { readonly calls: readonly Invocation[]; readonly depth: number };

const OPERATORS = new Set(['mergeMap', 'flatMap', 'concatMap', 'switchMap', 'exhaustMap']);
const UNLIMITED_OPERATORS = new Set(['mergeMap', 'flatMap']);
const MAX_HELPER_DEPTH = 2;
const MAX_TEXT = 50;

function isCall(call: Invocation): call is TSESTree.CallExpression {
  return 'type' in call && call.type === AST_NODE_TYPES.CallExpression;
}

function parameterReferences(context: Context, fn: Worker['fn']): TSESTree.Node[] {
  const variables = fn === undefined ? [] : context.sourceCode.getDeclaredVariables(fn);
  return variables.flatMap((variable) => variable.references.map(({ identifier }) => identifier));
}

function readsElement(call: Invocation, references: readonly TSESTree.Node[]): boolean {
  return isCall(call) && references.some((identifier) => contains(call, identifier));
}

function isLiteralSet(node: TSESTree.Node): boolean {
  const target = skipped(node);
  if (target.type !== AST_NODE_TYPES.NewExpression) {
    return false;
  }
  const items = target.arguments[0];
  return (
    target.callee.type === AST_NODE_TYPES.Identifier &&
    target.callee.name === 'Set' &&
    items?.type === AST_NODE_TYPES.ArrayExpression &&
    items.elements.every((item) => item !== null && item.type !== AST_NODE_TYPES.SpreadElement)
  );
}

function directLookup(context: Context, calls: readonly Invocation[]): Lookup | undefined {
  return calls
    .filter(isCall)
    .filter((call) => !callEffects(call, context).has('write'))
    .map((call) => ioEffect(call, context))
    .find((effect) => effect !== undefined && effect.kind !== 'message' && !effect.cache);
}

function lookupIn(context: Context, io: Io, body: readonly Invocation[]): Lookup | undefined {
  const pending: Frame[] = [{ calls: body, depth: 0 }];
  for (const { calls, depth } of pending) {
    const effect = directLookup(context, calls);
    if (effect !== undefined) {
      return effect;
    }
    const helpers = depth < MAX_HELPER_DEPTH ? calls.map((call) => io.helperOf(call)) : [];
    const frames = helpers
      .filter((helper) => helper !== undefined)
      .map((helper) => ({ calls: callsOf({ fn: helper, root: helper }), depth: depth + 1 }));
    pending.push(...frames);
  }
  return undefined;
}

function perElementLookup(context: Context, io: Io, worker: Worker): Lookup | undefined {
  const references = parameterReferences(context, worker.fn);
  const calls = callsOf(worker).filter(
    (call) => worker.fn === undefined || readsElement(call, references),
  );
  return lookupIn(context, io, calls);
}

function isCovered(
  scope: FanOutScope,
  covered: {
    readonly name: string;
    readonly limited: boolean;
    readonly worker: Worker;
    readonly effect: Lookup;
  },
): boolean {
  const { name, limited, worker, effect } = covered;
  return (
    UNLIMITED_OPERATORS.has(name) &&
    !limited &&
    effect.kind === 'remote' &&
    remoteIn(scope, worker) !== undefined
  );
}

export const rule: TSESLint.RuleModule<'lookup', [], { readonly requiresTypeChecking: boolean }> = {
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
        if (name === undefined || !OPERATORS.has(name)) {
          return;
        }
        const worker = workerOf(context, project);
        const collection = worker === undefined ? undefined : pipeSource(context, node);
        const effect =
          worker === undefined || collection === undefined
            ? undefined
            : perElementLookup(context, io, worker);
        const limited = rest.some((argument) => !isUnlimited(context, argument));
        if (
          worker === undefined ||
          collection === undefined ||
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
