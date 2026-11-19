import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { heldScope } from '../../effects/held-scopes.mts';
import type { Call } from '../../effects/scopes/scope-types.mts';
import type { Context } from '../../security/security-values.mts';
import { estreeCallView } from '../../support/io/call-views.mts';
import { transactionCallback } from '../clients.mts';
import { inAfterCommitHook } from './after-commit.mts';
import { cacheKindOf, type CacheKind } from './cache-clients.mts';
import { writtenValue } from './written-values.mts';

type Held = { readonly opener: Call; readonly body: TSESTree.Node };

const ROLLBACK = 'a rollback undoes the database change but not the cache write';

function transactionOf(node: TSESTree.Node, context: Context): Held | undefined {
  const fn = transactionCallback(node);
  if (fn !== undefined) {
    return { opener: fn.parent, body: fn.body };
  }
  const held = heldScope('transaction', node, context);
  const builder = held?.opener.parent.type === AST_NODE_TYPES.MemberExpression;
  return held?.param === undefined || builder
    ? undefined
    : { opener: held.opener, body: held.root };
}

export const rule: TSESLint.RuleModule<'cacheWrite' | 'localWrite'> = {
  meta: {
    type: 'problem',
    docs: { description: 'Do not write a cache inside a database transaction' },
    schema: [],
    messages: {
      cacheWrite: [
        'This writes the cache with `{{write}}` inside the transaction opened by `{{opener}}`:',
        `${ROLLBACK}, so other requests and nodes keep reading a value or an eviction that never`,
        'happened until it expires. Move the cache write after the transaction commits: after',
        '`await {{opener}}` returns (a TypeORM `afterTransactionCommit` subscriber also runs after the commit).',
      ].join(' '),
      localWrite: [
        'This stores a value written by `{{written}}` in the in-memory `{{write}}` inside the transaction',
        `opened by \`{{opener}}\`: ${ROLLBACK}, so the map keeps a row or generated id that was never`,
        'committed.',
        'Fill the map after the transaction commits (after `await {{opener}}` returns) from the returned value.',
      ].join(' '),
    },
  },
  create(context) {
    function report(call: TSESTree.CallExpression, held: Held, kind: CacheKind): void {
      const data = {
        write: estreeCallView(call, undefined).label,
        opener: estreeCallView(held.opener, undefined).label,
      };
      if (kind === 'client') {
        context.report({ node: call, messageId: 'cacheWrite', data });
        return;
      }
      const written = writtenValue(call.arguments, { context, body: held.body });
      if (written?.type === AST_NODE_TYPES.CallExpression) {
        const label = estreeCallView(written, undefined).label;
        context.report({ node: call, messageId: 'localWrite', data: { ...data, written: label } });
      }
    }
    return {
      CallExpression(call) {
        const found = cacheKindOf(call, context);
        const held = found === undefined ? undefined : transactionOf(call, context);
        if (found !== undefined && held !== undefined && !inAfterCommitHook(call, held.body)) {
          report(call, held, found.kind);
        }
      },
    };
  },
};
