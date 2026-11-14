import { RULES_TOOL } from '../tool.mjs';

const SCOPES = {
  'retry loop': 'a retry loop',
  Retrying: 'a tenacity `Retrying` loop',
};

function describe(subject) {
  const [commit = 'session.commit()', scope = 'retry loop'] = subject.split('|');
  const where = SCOPES[scope] ?? `\`${scope}\``;
  return `\`${commit}\` is retried after a \`StaleDataError\` in ${where} that never reads the row again, so every attempt sends the same object with the old version and fails the same way, or, after a rollback, the change is lost`;
}

export const STALE_RETRY_HINTS = [
  {
    tool: RULES_TOOL,
    rules: ['stale-retry'],
    describe,
    allowed:
      'Read the row again inside each attempt and apply the change again: `order = session.get(Order, order_id)`, `order.status = "done"`, then `session.commit()`, with `session.rollback()` in the `except StaleDataError` handler. Take the id, not the loaded object, in the retried function; `session.refresh(order)` reloads the version when the change is re-applied after it. An exception fits only when the retry must resend the same object on purpose.',
  },
];
