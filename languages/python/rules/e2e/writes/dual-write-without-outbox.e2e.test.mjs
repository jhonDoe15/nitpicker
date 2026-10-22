import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from '../../test-support/python-script-helpers.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { cleanup, outcomes } = createScripts({ hidden: ['test-without-assertion'] });
afterEach(cleanup);

const code = (...lines) => `${lines.join('\n')}\n`;
const KAFKA = ['from kafka import KafkaProducer', '', 'producer = KafkaProducer()', '', ''];

describe.skipIf(!enabled)('dual-write-without-outbox', () => {
  it('flags a function that writes to the database and publishes a message', () => {
    const [actual, expected] = outcomes([
      [
        'a repository save and a Kafka send',
        code(
          ...KAFKA,
          'def place(repo, order):',
          '    repo.save(order)',
          '    producer.send("orders", order)',
        ),
        ['dual-write-without-outbox:8 place|repo.save()|producer.send()'],
      ],
      [
        'a session add and a Celery delay',
        code(
          'from celery import shared_task',
          '',
          '',
          '@shared_task',
          'def notify(order_id):',
          '    return order_id',
          '',
          '',
          'def place(session, order):',
          '    session.add(order)',
          '    session.commit()',
          '    notify.delay(order.id)',
        ),
        ['dual-write-without-outbox:12 place|session.add()|notify.delay()'],
      ],
      [
        'a Django create and a pika publish',
        code(
          'import pika',
          'from django.db import models',
          '',
          '',
          'def place(channel, data):',
          '    Order.objects.create(**data)',
          '    channel.basic_publish(exchange="", routing_key="orders", body="x")',
        ),
        ['dual-write-without-outbox:7 place|Order.objects.create()|channel.basic_publish()'],
      ],
      [
        'a SQL insert and an SNS publish',
        code(
          'import boto3',
          '',
          'topic = boto3.client("sns")',
          '',
          '',
          'def place(cursor, order):',
          '    cursor.execute("INSERT INTO orders (id) VALUES (%s)", (order,))',
          '    topic.publish(TopicArn="t", Message="x")',
        ),
        ['dual-write-without-outbox:8 place|cursor.execute()|topic.publish()'],
      ],
      [
        'a Django save and a publish after the commit',
        code(
          'from celery import shared_task',
          'from django.db import models, transaction',
          '',
          '',
          '@shared_task',
          'def notify(order_id):',
          '    return order_id',
          '',
          '',
          'def place(order):',
          '    with transaction.atomic():',
          '        order.save()',
          '        transaction.on_commit(lambda: notify.delay(order.id))',
        ),
        ['dual-write-without-outbox:13 place|order.save()|notify.delay()|on-commit'],
      ],
      [
        'a write and a publish through two helpers',
        code(
          ...KAFKA,
          'def store(repo, order):',
          '    repo.save(order)',
          '',
          '',
          'def announce(order):',
          '    producer.send("orders", order)',
          '',
          '',
          'def place(repo, order):',
          '    store(repo, order)',
          '    announce(order)',
        ),
        ['dual-write-without-outbox:16 place|store() > repo.save()|announce() > producer.send()'],
      ],
      [
        'a helper that does both is reported once, in the helper',
        code(
          ...KAFKA,
          'def place(repo, order):',
          '    repo.save(order)',
          '    producer.send("orders", order)',
          '',
          '',
          'def handle(repo, order):',
          '    place(repo, order)',
        ),
        ['dual-write-without-outbox:8 place|repo.save()|producer.send()'],
      ],
      [
        'an outbox row without a publish',
        code(
          ...KAFKA,
          'def place(repo, outbox, order):',
          '    repo.save(order)',
          '    outbox.save({"topic": "orders", "body": order})',
        ),
        [],
      ],
      [
        'a publish without a write',
        code(...KAFKA, 'def announce(order):', '    producer.send("orders", order)'),
        [],
      ],
      [
        'a read and a publish',
        code(
          ...KAFKA,
          'def announce(repo, ident):',
          '    order = repo.find_by_id(ident)',
          '    producer.send("orders", order)',
        ),
        [],
      ],
      [
        'a test file',
        {
          file: 'tests/test_place.py',
          code: code(
            ...KAFKA,
            'def test_place(repo, order):',
            '    repo.save(order)',
            '    producer.send("orders", order)',
          ),
        },
        [],
      ],
    ]);
    expect(actual).toEqual(expected);
  });
});
