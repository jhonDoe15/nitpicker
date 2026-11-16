import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { nameOf } from '../typed/node-views.mts';
import type { FunctionNode } from '../typed/syntax-views.mts';
import { estreeRunsWithCaller } from '../support/flow/sync-callbacks.mts';
import { estreeCallView } from '../support/io/call-views.mts';
import { isEstreeConsumed } from '../support/flow/consumed.mts';
import { ormSite } from '../support/orm/sites.mts';
import { rootNode } from '../support/orm/chains.mts';
import {
  clientOrigin,
  mentionsTransaction,
  transactionCallback,
  type ClientScope,
} from './clients.mts';
import { inExclusiveBranches } from './exclusive-branches.mts';
import { isTransactionalUnit, unitWrites, type OrmCall } from './writes-in-units.mts';

const OPTIONS_INDEX = new Map([
  ['create', 1],
  ['bulkCreate', 1],
  ['update', 1],
  ['upsert', 1],
  ['increment', 1],
  ['decrement', 1],
  ['destroy', 0],
  ['restore', 0],
  ['findOrCreate', 0],
]);
const WHAT_TO_DO = [
  'Run the writes in one transaction and pass its manager down, or use one atomic statement',
  '(`upsert`, `insert ... on conflict`).',
].join(' ');

function sequelizeEscapes(found: OrmCall, { context, fn }: ClientScope): boolean {
  const { site, call } = found;
  const method = site.chain.steps.at(-1)?.name;
  const index = method === undefined ? undefined : OPTIONS_INDEX.get(method);
  const options = index === undefined ? undefined : call.arguments[index];
  if (mentionsTransaction(call.arguments, context, fn)) {
    return false;
  }
  if (options === undefined) {
    return true;
  }
  return (
    options.type === AST_NODE_TYPES.ObjectExpression &&
    options.properties.every((property) => property.type === AST_NODE_TYPES.Property) &&
    !options.properties.some(
      (property) =>
        property.type === AST_NODE_TYPES.Property && nameOf(property.key) === 'transaction',
    )
  );
}

function escapes(found: OrmCall, scope: ClientScope): boolean {
  const { site, call } = found;
  const { context, fn } = scope;
  if (site.orm === 'mikro') {
    return false;
  }
  if (site.orm === 'sequelize') {
    return sequelizeEscapes(found, scope);
  }
  const root = rootNode(call);
  const origin = root?.type === AST_NODE_TYPES.Identifier ? clientOrigin(root, scope) : 'this';
  return (
    root !== undefined &&
    (origin === 'this' || origin === 'other') &&
    !mentionsTransaction(call.arguments, context, fn)
  );
}

function conflictingPair(
  writes: readonly OrmCall[],
): { readonly first: OrmCall; readonly second: OrmCall } | undefined {
  for (const [index, second] of writes.entries()) {
    const first = writes
      .slice(0, index)
      .find(
        (earlier) =>
          earlier.site.table !== second.site.table &&
          !inExclusiveBranches(earlier.call, second.call),
      );
    if (first !== undefined) {
      return { first, second };
    }
  }
  return undefined;
}

type Options = readonly [
  { readonly orms?: readonly string[]; readonly opensTransactions?: boolean }?,
];

export const rule: TSESLint.RuleModule<'escaped' | 'separate', Options> = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Run related database writes in one transaction and write through the open one',
    },
    schema: [
      {
        type: 'object',
        properties: {
          orms: { type: 'array', items: { type: 'string' } },
          opensTransactions: { type: 'boolean' },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      escaped: [
        'This writes through `{{client}}` inside the transaction opened by `{{opener}}`, so the write',
        'runs outside that transaction and is not rolled back with the others.',
        'Write through the callback parameter (or pass it down), not a client or repository from outside.',
        'An exception fits only when the write must survive a rollback.',
      ].join(' '),
      separate: [
        'This function awaits writes to `{{first}}` and `{{second}}` with no transaction, so a crash or a',
        `concurrent request between them leaves half-written state. ${WHAT_TO_DO}`,
        'An exception fits only when the writes are independent (an audit log, a best-effort cleanup).',
      ].join(' '),
    },
  },
  create(context) {
    const { orms = [], opensTransactions = false } = context.options[0] ?? {};
    if (orms.length === 0) {
      return {};
    }
    function checkEscape(call: TSESTree.CallExpression): void {
      const fn = isEstreeConsumed(call) ? transactionCallback(call) : undefined;
      const site = fn === undefined ? undefined : ormSite(call, 'write', orms);
      if (site !== undefined && fn !== undefined && escapes({ site, call }, { context, fn })) {
        context.report({
          node: call,
          messageId: 'escaped',
          data: {
            client: estreeCallView(call, undefined).label,
            opener: estreeCallView(fn.parent, undefined).label,
          },
        });
      }
    }
    function checkUnit(fn: FunctionNode): void {
      if (
        !opensTransactions ||
        estreeRunsWithCaller(fn) ||
        isTransactionalUnit(fn, context.sourceCode.visitorKeys)
      ) {
        return;
      }
      const pair = conflictingPair(unitWrites(fn.body, context, orms));
      if (pair !== undefined) {
        context.report({
          node: pair.second.call,
          messageId: 'separate',
          data: {
            first: estreeCallView(pair.first.call, undefined).label,
            second: estreeCallView(pair.second.call, undefined).label,
          },
        });
      }
    }
    return {
      CallExpression: checkEscape,
      FunctionDeclaration: checkUnit,
      FunctionExpression: checkUnit,
      ArrowFunctionExpression: checkUnit,
    };
  },
};
