import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from '../../test-support/python-script-helpers.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { cleanup, outcomes } = createScripts({ hidden: ['swallowed-exception'] });
afterEach(cleanup);

const code = (...lines) => `${lines.join('\n')}\n`;
const STRIPE = [
  'import stripe',
  'from stripe import StripeClient',
  'from tenacity import retry',
  '',
];
const SQL = ['from sqlalchemy import text', 'from tenacity import retry', '', ''];
const KAFKA = [
  'from kafka import KafkaProducer',
  'from tenacity import retry',
  '',
  'producer = KafkaProducer()',
];

describe.skipIf(!enabled)('retry-without-idempotency forms', () => {
  it('reads a Stripe client resource by its whole name', () => {
    const [actual, expected] = outcomes([
      [
        'multi-word resources',
        code(
          ...STRIPE,
          'client = StripeClient("key")',
          '',
          '',
          '@retry',
          'def a():',
          '    client.payment_intents.create({"amount": 1})',
          '',
          '',
          '@retry',
          'def b():',
          '    client.v1.setup_intents.create({"usage": "off_session"})',
          '',
          '',
          '@retry',
          'def c(key):',
          '    client.payment_links.create({"line_items": []}, options={"idempotency_key": key})',
        ),
        [
          'retry-without-idempotency:10 client.payment_intents.create()|payment|@retry',
          'retry-without-idempotency:15 client.v1.setup_intents.create()|payment|@retry',
        ],
      ],
    ]);
    expect(actual).toEqual(expected);
  });

  it('reads a library callable handed to a retrying object with the arguments of that call', () => {
    const [actual, expected] = outcomes([
      [
        'a Retrying call and a named Retrying object',
        code(
          'import stripe',
          'from tenacity import Retrying, stop_after_attempt',
          '',
          '',
          'def charge(amount):',
          '    return Retrying(stop=stop_after_attempt(3))(stripe.Charge.create, amount=amount)',
          '',
          '',
          'def charge_named(amount):',
          '    retrying = Retrying(stop=stop_after_attempt(3))',
          '    return retrying(stripe.Charge.create, amount=amount)',
          '',
          '',
          'def charge_once(amount, key):',
          '    retrying = Retrying(stop=stop_after_attempt(3))',
          '    return retrying(stripe.Charge.create, amount=amount, idempotency_key=key)',
        ),
        [
          'retry-without-idempotency:6 stripe.Charge.create()|payment|Retrying',
          'retry-without-idempotency:11 stripe.Charge.create()|payment|Retrying',
        ],
      ],
    ]);
    expect(actual).toEqual(expected);
  });

  it('reads the SQL of a text() wrapper and of a variable, and passes an upsert', () => {
    const [actual, expected] = outcomes([
      [
        'inserts through text() and a variable',
        code(
          ...SQL,
          '@retry',
          'def a(session, x):',
          '    session.execute(text("INSERT INTO t (a) VALUES (:a)"), {"a": x})',
          '',
          '',
          '@retry',
          'def b(session, x):',
          '    query = "INSERT INTO t (a) VALUES (:a)"',
          '    session.execute(text(query), {"a": x})',
          '',
          '',
          '@retry',
          'def c(cursor, x):',
          '    statement = "INSERT INTO t (a) VALUES (%s)"',
          '    cursor.execute(statement, (x,))',
        ),
        [
          'retry-without-idempotency:7 session.execute()|insert|@retry',
          'retry-without-idempotency:13 session.execute()|insert|@retry',
          'retry-without-idempotency:19 cursor.execute()|insert|@retry',
        ],
      ],
      [
        'inserts that ignore, replace or merge',
        code(
          ...SQL,
          '@retry',
          'def a(cursor, x):',
          '    cursor.execute("INSERT IGNORE INTO t (a) VALUES (%s)", (x,))',
          '    cursor.execute("REPLACE INTO t (a) VALUES (%s)", (x,))',
          '    cursor.execute("MERGE INTO t USING s ON t.a = s.a WHEN NOT MATCHED THEN INSERT (a) VALUES (s.a)")',
          '    cursor.execute(text("INSERT INTO t (a) VALUES (:a) ON CONFLICT DO NOTHING"), {"a": x})',
        ),
        [],
      ],
    ]);
    expect(actual).toEqual(expected);
  });

  it('passes a message with an id that consumers deduplicate on', () => {
    const [actual, expected] = outcomes([
      [
        'message ids for Kafka, AMQP and Celery',
        code(
          ...KAFKA,
          'import pika',
          'from celery import shared_task',
          '',
          '',
          '@shared_task',
          'def notify(order_id):',
          '    return order_id',
          '',
          '',
          '@retry',
          'def a(event, key):',
          '    producer.send("events", event, headers=[("message_id", key.encode())])',
          '',
          '',
          '@retry',
          'def b(channel, body, key):',
          '    properties = pika.BasicProperties(message_id=key)',
          '    channel.basic_publish(exchange="", routing_key="q", body=body, properties=properties)',
          '',
          '',
          '@retry',
          'def c(order_id):',
          '    notify.apply_async((order_id,), task_id=f"notify-{order_id}")',
        ),
        [],
      ],
    ]);
    expect(actual).toEqual(expected);
  });

  it('reads AsyncRetrying and stamina attempts as retry scopes', () => {
    const [actual, expected] = outcomes([
      [
        'async and stamina attempts',
        code(
          ...KAFKA,
          'import stamina',
          'from tenacity import AsyncRetrying',
          '',
          '',
          'async def a(event):',
          '    async for attempt in AsyncRetrying():',
          '        with attempt:',
          '            producer.send("events", event)',
          '',
          '',
          'def b(event):',
          '    for attempt in stamina.retry_context(on=OSError):',
          '        with attempt:',
          '            producer.send("events", event)',
        ),
        [
          'retry-without-idempotency:12 producer.send()|message|AsyncRetrying',
          'retry-without-idempotency:18 producer.send()|message|retry_context',
        ],
      ],
    ]);
    expect(actual).toEqual(expected);
  });

  it('flags a hand-written retry loop that raises only on the last attempt', () => {
    const [actual, expected] = outcomes([
      [
        'a last-attempt raise and an else that leaves the loop',
        code(
          ...KAFKA,
          'import time',
          '',
          '',
          'def a(event):',
          '    for attempt in range(3):',
          '        try:',
          '            producer.send("events", event)',
          '            break',
          '        except OSError:',
          '            if attempt == 2:',
          '                raise',
          '            time.sleep(1)',
          '',
          '',
          'def b(event):',
          '    for _ in range(3):',
          '        try:',
          '            producer.send("events", event)',
          '        except OSError:',
          '            time.sleep(1)',
          '        else:',
          '            return',
        ),
        [
          'retry-without-idempotency:11 producer.send()|message|retry loop',
          'retry-without-idempotency:22 producer.send()|message|retry loop',
        ],
      ],
    ]);
    expect(actual).toEqual(expected);
  });

  it('reads a Celery task that retries itself as a retry scope', () => {
    const [actual, expected] = outcomes([
      [
        'autoretry_for, retry_backoff and self.retry',
        code(
          'from celery import shared_task',
          'from kafka import KafkaProducer',
          '',
          'producer = KafkaProducer()',
          '',
          '',
          '@shared_task(autoretry_for=(OSError,), max_retries=3)',
          'def a(event):',
          '    producer.send("a", event)',
          '',
          '',
          '@shared_task(retry_backoff=True)',
          'def b(event):',
          '    producer.send("b", event)',
          '',
          '',
          '@shared_task(bind=True)',
          'def c(self, event):',
          '    try:',
          '        producer.send("c", event)',
          '    except OSError as error:',
          '        raise self.retry(exc=error)',
          '',
          '',
          '@shared_task(bind=True)',
          'def d(self, event):',
          '    producer.send("d", event)',
        ),
        [
          'retry-without-idempotency:9 producer.send()|message|@shared_task(autoretry_for)',
          'retry-without-idempotency:14 producer.send()|message|@shared_task(retry_backoff)',
          'retry-without-idempotency:20 producer.send()|message|@shared_task with self.retry',
        ],
      ],
    ]);
    expect(actual).toEqual(expected);
  });
});
