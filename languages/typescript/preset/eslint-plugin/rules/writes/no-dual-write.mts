import type { TSESLint, TSESTree } from '@typescript-eslint/utils';
import { callsWithin } from '../effects/held-scopes.mts';
import type { Context } from '../security/security-values.mts';
import { estreeRunsWithCaller } from '../support/flow/sync-callbacks.mts';
import { callEffects, describePath, mayPublish } from '../support/io-effects.mts';
import { isRelayPublish } from './relays.mts';
import { publishesAfterCommit, type Site } from './write-sites.mts';

type FunctionNode =
  TSESTree.FunctionDeclaration | TSESTree.FunctionExpression | TSESTree.ArrowFunctionExpression;

const WRITE = 'write';
const CACHE = 'cache';
const MESSAGE = 'message';
const OUTBOX = [
  'Write the message to an outbox table in the same transaction and let a relay publish it',
  '(or use change data capture or a database-backed queue);',
  'a relay loop that reads rows from the database, publishes each and then updates that row is fine.',
].join(' ');

function sitesWith(effects: Site[], tag: string, excluded: readonly string[]): Site[] {
  return effects.filter(
    (site) => site.effects.has(tag) && !excluded.some((other) => site.effects.has(other)),
  );
}

function unitSites(
  context: Context,
  body: TSESTree.Node,
): { readonly publishes: Site[]; readonly writes: Site[] } {
  const effects = callsWithin(body, context.sourceCode.visitorKeys).map((call) => ({
    call,
    effects: callEffects(call, context),
  }));
  const publishes = sitesWith(effects, MESSAGE, [WRITE]);
  return {
    publishes,
    writes: publishes.length === 0 ? [] : sitesWith(effects, WRITE, [MESSAGE, CACHE]),
  };
}

function describeEffect(site: Site, tag: string): string {
  return describePath(site.effects.get(tag) ?? []);
}

export const rule: TSESLint.RuleModule<
  'dualWrite' | 'afterCommit',
  [],
  { readonly requiresTypeChecking: boolean }
> = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Do not write to the database and publish a message in the same function',
      requiresTypeChecking: true,
    },
    schema: [],
    messages: {
      dualWrite: [
        'This publishes {{message}} in the same function that writes {{write}}: if the write rolls back',
        'after the publish, consumers act on a change that never happened, and if the write commits and',
        `the process stops before the publish, the message is lost. ${OUTBOX}`,
        'An exception fits only when a lost or phantom message is acceptable.',
      ].join(' '),
      afterCommit: [
        'This publishes {{message}} after the transaction that writes {{write}} commits: a rolled-back',
        'change is no longer published, but a crash between the commit and the publish loses the message.',
        `${OUTBOX} An exception fits only when a lost message is acceptable.`,
      ].join(' '),
    },
  },
  create(context) {
    if (!mayPublish(context)) {
      return {};
    }
    function check(unit: TSESTree.Node, body: TSESTree.Node): void {
      const { writes, publishes } = unitSites(context, body);
      const publish = publishes.find((site) => !isRelayPublish(site, writes, context));
      const [firstWrite] = writes;
      if (firstWrite === undefined || publish === undefined) {
        return;
      }
      const afterCommit = publishesAfterCommit(publish, writes, { context, unit });
      context.report({
        node: publish.call,
        messageId: afterCommit ? 'afterCommit' : 'dualWrite',
        data: {
          message: describeEffect(publish, MESSAGE),
          write: describeEffect(firstWrite, WRITE),
        },
      });
    }
    function checkFunction(fn: FunctionNode): void {
      if (!estreeRunsWithCaller(fn)) {
        check(fn, fn.body);
      }
    }
    return {
      Program(node) {
        check(node, node);
      },
      FunctionDeclaration: checkFunction,
      FunctionExpression: checkFunction,
      ArrowFunctionExpression: checkFunction,
    };
  },
};
