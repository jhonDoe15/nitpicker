import { RULES_TOOL } from '../tool.mjs';
import { parseEffect, pathPhrase } from '../effects/subject.mjs';

const WRITES = {
  payment: 'creates a payment object without an idempotency key',
  message: 'publishes a message without a deduplication id',
  insert: 'inserts a row without an upsert',
};

function describe(subject) {
  const { path, fields } = parseEffect(subject);
  const [write = 'message', scope = 'a retry'] = fields;
  return `${pathPhrase(path)} ${WRITES[write]} inside \`${scope}\`: when the server accepts the write and the response times out, the retry runs it a second time`;
}

export const RETRY_HINTS = [
  {
    tool: RULES_TOOL,
    rules: ['retry-without-idempotency'],
    describe,
    allowed:
      'Send a stable idempotency key derived from the request (`idempotency_key=` for Stripe, `MessageDeduplicationId` for SQS and SNS FIFO), turn the insert into an upsert (`ON CONFLICT DO NOTHING` or `DO UPDATE`), or retry only the read and keep the write outside the retry.',
  },
];
