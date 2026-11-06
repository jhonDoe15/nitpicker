import { remoteInScope } from './remote-in-scope.mjs';

export const rule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Do not make a remote call while a database transaction is open',
      requiresTypeChecking: true,
    },
    schema: [],
    messages: {
      transaction: [
        'This calls {{callee}} inside the transaction of `{{scope}}`, so a database connection stays',
        "held for the remote call's latency and the pool runs dry under load.",
        'Make the remote call before the transaction starts or after it commits;',
        "when its side effect must match the transaction's outcome, write an outbox row inside the",
        'transaction and send it from a worker.',
        'An exception fits only when the remote call must see uncommitted state and has a short timeout.',
      ].join(' '),
    },
  },
  create: remoteInScope('transaction', true),
};
