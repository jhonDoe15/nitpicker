import type { TSESLint } from '@typescript-eslint/utils';
import { estreeRunsWithCaller } from '../support/flow/sync-callbacks.mts';
import { estreeCallView } from '../support/io/call-views.mts';
import { decidedWrite, unitReads } from './check-then-write.mts';
import type { FunctionNode } from '../typed/syntax-views.mts';
import {
  isTransactionalUnit,
  unitWrites,
  WRITE_OPTIONS_SCHEMA,
  type WriteOptions,
} from './writes-in-units.mts';

export const rule: TSESLint.RuleModule<'race', WriteOptions> = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Do not let a read decide a write to the same table without a lock or an atomic statement',
    },
    schema: WRITE_OPTIONS_SCHEMA,
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
    const { orms = [], opensTransactions } = context.options[0] ?? {
      opensTransactions: false,
    };
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
