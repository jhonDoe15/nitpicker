import { cases, typescriptRuleTester } from '../../test-support/rule-tester.mjs';
import { typedIoProject } from '../../test-support/typed-io-project.mjs';
import { rule } from './no-retry-without-idempotency.mjs';

const pRetry = "import pRetry from 'p-retry';\n";
const insert = "db.query('INSERT INTO orders (id) VALUES ($1)', [id])";

typescriptRuleTester().run('no-retry-without-idempotency', rule, {
  valid: cases([
    `${pRetry}await pRetry(() => db.query('INSERT INTO orders (id) VALUES ($1) ON CONFLICT DO NOTHING', [id]));`,
    `${pRetry}await pRetry(() => db.query('SELECT * FROM orders WHERE id = $1', [id]));`,
    `${pRetry}await pRetry(() => fetch(url, { method: 'POST' }));`,
    `await retryLater(() => ${insert});`,
    `for (const id of ids) { try { await ${insert}; } catch { log(); } }`,
    `${pRetry}await pRetry(loadOrder);`,
  ]),
  invalid: [
    `${pRetry}await pRetry(() => ${insert});`,
    `import retry from 'async-retry';\nawait retry(async () => { await ${insert}; });`,
    `import { backOff } from 'exponential-backoff';\nawait backOff(() => ${insert});`,
    `import { retry, handleAll } from 'cockatiel';\nawait retry(handleAll, { maxAttempts: 3 }).execute(() => ${insert});`,
    `import { retry, handleAll } from 'cockatiel';\nconst policy = retry(handleAll, {});\nawait policy.execute(() => ${insert});`,
    `const pRetry = require('p-retry');\nawait pRetry(() => ${insert});`,
    `const { backOff } = require('exponential-backoff');\nawait backOff(() => ${insert});`,
    `import pRetry = require('p-retry');\nawait pRetry(() => ${insert});`,
    `for (const attempt of attempts) { try { await ${insert}; break; } catch { wait(attempt); } }`,
  ].map((code) => ({ code, errors: [{ messageId: 'retry' }] })),
});

const STORE = [
  "import { Producer } from 'kafkajs';",
  'declare const producer: Producer;',
  "export async function sendOrder(id: string) { await producer.send({ topic: 'orders', messages: [id] }); }",
  "export class Sender { async send(id: string) { await producer.send({ topic: 'orders', messages: [id] }); } }",
  'export async function readOrder(id: string) { return id; }',
].join('\n');

const { tester, typed, typedFile } = typedIoProject('retry', STORE);
const HEADER = [
  pRetry,
  "import Stripe from 'stripe';",
  "import { Queue } from 'bullmq';",
  "import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';",
  "import { sendOrder, readOrder, Sender } from './store';",
  "const stripe = new Stripe('key');",
  "const queue = new Queue('orders');",
  'const sqs = new SQSClient();',
  '',
].join('\n');

function retried(body) {
  return typed(
    `${HEADER}export async function run(id: string) { await pRetry(async () => { ${body} }); }`,
  );
}

tester.run('no-retry-without-idempotency with types', rule, {
  valid: [
    retried('await stripe.customers.create({ email: id }, { idempotencyKey: id });'),
    retried('await stripe.customers.retrieve(id);'),
    retried("await queue.add('order', { id }, { jobId: id });"),
    retried(
      "await sqs.send(new SendMessageCommand({ QueueUrl: 'q', MessageBody: id, MessageDeduplicationId: id }));",
    ),
    typed(`${HEADER}export async function run() { await pRetry(readOrder); }`),
  ],
  invalid: [
    ...[
      retried('await stripe.customers.create({ email: id });'),
      retried("await queue.add('order', { id });"),
      retried("await sqs.send(new SendMessageCommand({ QueueUrl: 'q', MessageBody: id }));"),
      retried('await sendOrder(id);'),
      typed(
        `${HEADER}export async function run(sender: Sender) { await pRetry(sender.send.bind(sender)); }`,
      ),
      typedFile(
        "const pRetry = require('p-retry');\nconst { sendOrder } = require('./store');\nmodule.exports = async function run(id) { await pRetry(() => sendOrder(id)); };",
        'cjs',
      ),
    ].map((code) => ({ ...code, errors: [{ messageId: 'retry' }] })),
    {
      ...typed(`${HEADER}export async function run() { await pRetry(sendOrder); }`),
      errors: [
        {
          messageId: 'retry',
          data: { callee: '`sendOrder()`, which calls `producer.send()`', scope: '`pRetry()`' },
        },
      ],
    },
  ],
});
