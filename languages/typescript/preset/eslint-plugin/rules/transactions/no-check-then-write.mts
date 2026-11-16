import type { TSESLint } from '@typescript-eslint/utils';
import { estreeRunsWithCaller } from '../support/flow/sync-callbacks.mts';
import { estreeCallView } from '../support/io/call-views.mts';
import { decidedWrite, unitReads } from './check-then-write.mts';
import type { FunctionNode } from '../typed/syntax-views.mts';
import { isTransactionalUnit, unitWrites } from './writes-in-units.mts';

type Options = readonly [
  { readonly orms?: readonly string[]; readonly opensTransactions?: boolean }?,
];

export const rule: TSESLint.RuleModule<'race', Options> = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Do not let a read decide a write to the same table without a lock or an atomic statement',
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
      race: [
        'This writes after `{{read}}` decided it with no transaction or lock, so two concurrent callers can',
        'both pass the check (a limit is exceeded, a version is overwritten).',
        'Take a row lock inside a transaction (`FOR UPDATE`, a pessimistic lock option), or use an atomic',
        'statement (`upsert`, `insert ... on conflict`, `update ... where version = ?`).',
        'An exception fits only when a concurrent caller cannot reach this code.',
      ].join(' '),
    },
  },
  create(context) {
    const { orms = [], opensTransactions = false } = context.options[0] ?? {};
    if (orms.length === 0 || !opensTransactions) {
      return {};
    }
    function checkUnit(fn: FunctionNode): void {
      if (estreeRunsWithCaller(fn) || isTransactionalUnit(fn, context.sourceCode.visitorKeys)) {
        return;
      }
      const writes = unitWrites(fn.body, context, orms);
      for (const read of unitReads(fn.body, context, orms)) {
        const write = decidedWrite(read, writes, { body: fn.body, context });
        if (write !== undefined) {
          context.report({
            node: write.call,
            messageId: 'race',
            data: { read: estreeCallView(read.call, undefined).label },
          });
        }
      }
    }
    return {
      FunctionDeclaration: checkUnit,
      FunctionExpression: checkUnit,
      ArrowFunctionExpression: checkUnit,
    };
  },
};
