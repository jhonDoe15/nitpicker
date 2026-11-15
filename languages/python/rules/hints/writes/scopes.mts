import { RULES_TOOL } from '../tool.mts';
import { parseEffect, pathPhrase } from '../effects/subject.mts';
import type { RuleHint } from '../hint-types.mts';

const OUTBOX =
  'when the remote side effect must match the transaction outcome, write an outbox row inside the transaction and send it from a worker instead of moving the call without thinking about consistency';

function remoteCallWhile(state: string): (subject: string) => string {
  return (subject) => {
    const { path, fields } = parseEffect(subject);
    const [held = ''] = fields;
    return `${pathPhrase(path)} makes a remote call while \`${held}\` ${state}`;
  };
}

const transactionDescribe = remoteCallWhile(
  'holds a database transaction: the connection stays checked out for the remote latency, which can exhaust the pool, and the remote side effect cannot roll back with the transaction',
);

const lockDescribe = remoteCallWhile(
  'is held: every other caller waits for the remote latency, and a slow or hung remote service blocks them all',
);

export const SCOPE_HINTS: readonly RuleHint[] = [
  {
    tool: RULES_TOOL,
    rules: ['remote-call-in-transaction'],
    describe: transactionDescribe,
    allowed: `Make the remote call before the transaction starts or after it commits (\`transaction.on_commit(...)\` in Django); ${OUTBOX}.`,
  },
  {
    tool: RULES_TOOL,
    rules: ['remote-call-under-lock'],
    describe: lockDescribe,
    allowed:
      'Make the remote call before taking the lock or after releasing it, and keep only the change of the shared state inside; copy the value you need out of the lock first. A fill-once block stays allowed: the call under an `if` that tests the state the block then sets (a token refresh, a cached download), so callers wait for one request instead of each sending their own. When the remote effect must happen exactly once per state change, record it in an outbox row and send it from a worker.',
  },
];
