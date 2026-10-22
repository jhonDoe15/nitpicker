import { ancestorsOf } from '../analysis/ancestry.mjs';
import { callsWithin } from '../effects/held-scopes.mjs';
import { callEffects, describePath } from '../support/io-effects.mjs';

const FUNCTIONS = new Set(['ArrowFunctionExpression', 'FunctionExpression']);
const WRITE = 'write';
const MESSAGE = 'message';
const OUTBOX = [
  'Write the message to an outbox table in the same transaction and let a relay publish it',
  '(or use change data capture or a database-backed queue).',
].join(' ');

function isCallback(fn) {
  return fn.parent.type === 'CallExpression' && fn.parent.arguments.includes(fn);
}

function isAfterCommit(call, fn) {
  return ancestorsOf(call)
    .filter(
      (ancestor) =>
        FUNCTIONS.has(ancestor.type) && ancestor !== fn && fn.range[0] <= ancestor.range[0],
    )
    .filter(isCallback)
    .some((callback) => callback.parent.callee.property?.name === 'afterCommit');
}

function sitesWith(effects, tag, other) {
  return effects.filter((site) => site.effects.has(tag) && !site.effects.has(other));
}

function sites(context, fn) {
  const effects = callsWithin(fn.body, context.sourceCode.visitorKeys).map((call) => ({
    call,
    effects: callEffects(call, context),
  }));
  return {
    writes: sitesWith(effects, WRITE, MESSAGE),
    publishes: sitesWith(effects, MESSAGE, WRITE),
  };
}

export const rule = {
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
    function check(fn) {
      const { writes, publishes } = isCallback(fn) ? { writes: [] } : sites(context, fn);
      const [publish] = publishes ?? [];
      if (writes.length === 0 || publish === undefined) {
        return;
      }
      context.report({
        node: publish.call,
        messageId: isAfterCommit(publish.call, fn) ? 'afterCommit' : 'dualWrite',
        data: {
          message: describePath(publish.effects.get(MESSAGE)),
          write: describePath(writes[0].effects.get(WRITE)),
        },
      });
    }
    return {
      FunctionDeclaration: check,
      FunctionExpression: check,
      ArrowFunctionExpression: check,
    };
  },
};
