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

describe.skipIf(!enabled)('dual-write-without-outbox relays and commits', () => {
  it('stays quiet for the outbox relay and flags a publish of a row it does not mark', () => {
    const [actual, expected] = outcomes([
      [
        'a relay that marks each published row',
        code(
          ...KAFKA,
          'from django.db import models',
          'from shop.models import Outbox',
          '',
          '',
          'def relay():',
          '    for row in Outbox.objects.filter(sent=False):',
          '        producer.send(row.topic, row.payload)',
          '        row.sent = True',
          '        row.save()',
        ),
        [],
      ],
      [
        'a loop that publishes read rows and writes something else',
        code(
          ...KAFKA,
          'from django.db import models',
          'from shop.models import Audit, Order',
          '',
          '',
          'def announce(day):',
          '    for order in Order.objects.filter(day=day):',
          '        producer.send("orders", order.pk)',
          '        Audit.objects.create(day=day)',
        ),
        [
          'dual-write-without-outbox:12 announce|Audit.objects.create()|producer.send()',
          'io-in-loop:13 Audit.objects.create()|database',
        ],
      ],
    ]);
    expect(actual).toEqual(expected);
  });

  it('names the after-commit window for a publish after a committed atomic block', () => {
    const [actual, expected] = outcomes([
      [
        'a publish after the atomic block',
        code(
          ...KAFKA,
          'from django.db import transaction',
          'from shop.models import Order',
          '',
          '',
          'def place(data):',
          '    with transaction.atomic():',
          '        order = Order.objects.create(**data)',
          '    producer.send("orders", order.pk)',
        ),
        ['dual-write-without-outbox:13 place|Order.objects.create()|producer.send()|on-commit'],
      ],
      [
        'a publish inside the atomic block',
        code(
          ...KAFKA,
          'from django.db import transaction',
          'from shop.models import Order',
          '',
          '',
          'def place(data):',
          '    with transaction.atomic():',
          '        order = Order.objects.create(**data)',
          '        producer.send("orders", order.pk)',
        ),
        ['dual-write-without-outbox:13 place|Order.objects.create()|producer.send()'],
      ],
    ]);
    expect(actual).toEqual(expected);
  });

  it('reads an HTTP session delete as a remote call, not a database write', () => {
    const [actual, expected] = outcomes([
      [
        'an aiohttp delete and a publish',
        code(
          ...KAFKA,
          'import aiohttp',
          '',
          '',
          'async def drop(url):',
          '    async with aiohttp.ClientSession() as session:',
          '        await session.delete(url)',
          '    producer.send("drops", url)',
        ),
        [],
      ],
    ]);
    expect(actual).toEqual(expected);
  });
});
