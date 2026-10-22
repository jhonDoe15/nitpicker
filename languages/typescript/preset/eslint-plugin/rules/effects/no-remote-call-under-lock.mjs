import { remoteInScope } from './remote-in-scope.mjs';

export const rule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Do not make a remote call while holding a lock',
      requiresTypeChecking: true,
    },
    schema: [],
    messages: {
      lock: [
        'This calls {{callee}} while `{{scope}}` holds a lock, so every waiter queues behind the',
        "remote call's latency (lock exhaustion under load).",
        'Make the remote call before taking the lock or after releasing it, and keep only the',
        'shared-state change under the lock; when the remote side effect must match it, record it',
        'in an outbox row and send it from a worker.',
        'An exception fits only when the lock exists to serialize that remote call.',
      ].join(' '),
    },
  },
  create: remoteInScope('lock', false),
};
