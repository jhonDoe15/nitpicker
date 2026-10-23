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

const ADVICE = {
  payment:
    'Send a stable idempotency key derived from the request (`idempotency_key=`), or retry only the read and keep the create outside the retry.',
  message:
    'Give the message a stable id derived from the request that consumers deduplicate on: `MessageDeduplicationId` for SQS and SNS FIFO, `message_id=` on an AMQP message (`pika.BasicProperties`, `aio_pika.Message`), a `message_id` header on a Kafka record, a `task_id=` derived from the request for Celery (`apply_async(..., task_id=...)`); or write an outbox row in the same transaction and let a relay publish it.',
  insert:
    'Turn the insert into an upsert (`ON CONFLICT DO NOTHING` or `DO UPDATE`, `INSERT IGNORE`, `MERGE`), or retry only the read and keep the write outside the retry.',
};

function allowed(subject) {
  return ADVICE[parseEffect(subject).fields[0]] ?? ADVICE.message;
}

export const RETRY_HINTS = [
  { tool: RULES_TOOL, rules: ['retry-without-idempotency'], describe, allowed },
];
